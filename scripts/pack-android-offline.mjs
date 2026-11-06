import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { hbuilderx } from './hbuilderx.mjs'
import { prepareAndroidStage } from './prepare-android-stage.mjs'
import { sourceDigest } from './tv-build-input.mjs'

const root = resolve(import.meta.dirname, '..')
const cache = join(root, '.cache')
const gradleVersion = '8.14.5'
const sdkVersion = '5.26.82680_20260914'
const readJson = file => JSON.parse(readFileSync(file, 'utf8'))
const sha256 = body => createHash('sha256').update(body).digest('hex')
const windows = process.platform === 'win32'

function requireFile(file, hint) {
  if (!existsSync(file)) throw new Error(`${hint}\nExpected ${file}`)
  return file
}

function run(command, args, { cwd = root, env = process.env, secrets = [], quiet = false } = {}) {
  const result = spawnSync(command, args, { cwd, env, windowsHide: true, maxBuffer: 16 * 1024 * 1024 })
  let output = String(result.stdout ?? '') + String(result.stderr ?? '')
  for (const secret of secrets.filter(Boolean)) output = output.split(secret).join('[REDACTED]')
  if (result.error || result.status !== 0) {
    throw new Error(`${command} failed (${result.error?.code ?? result.status})\n${output.trim()}`)
  }
  if (!quiet && output.trim()) process.stdout.write(output)
  return result.stdout
}

export function prepareOfflineResources(target, work) {
  const inputHash = sourceDigest(root)
  const stage = prepareAndroidStage(root, target, false, {
    stageDirectory: join(work, `${target}-uni`), compileNative: false,
  })
  const output = join(work, `${target}-resources`)
  const input = join(stage, 'src')
  run(process.execPath, [join(root, 'node_modules/@dcloudio/vite-plugin-uni/bin/uni.js'), 'build', '-p', 'app'], {
    cwd: stage,
    env: { ...process.env, FREETV_TARGET: target, UNI_INPUT_DIR: input, UNI_OUTPUT_DIR: output },
  })

  const manifest = readJson(join(input, 'manifest.json'))
  const runtime = readJson(join(output, 'manifest.json'))
  if (runtime.id !== manifest.appid || runtime.version.name !== manifest.versionName ||
      Number(runtime.version.code) !== Number(manifest.versionCode)) {
    throw new Error(`${target} resources have unexpected app identity or version`)
  }
  const player = join(output, 'uni_modules/freetv-player/utssdk/app-android')
  requireFile(join(player, 'src/index.kt'), 'The npm compiler did not generate the UTS bridge.')
  requireFile(join(player, 'src/FreeTVPlayerActivity.kt'), 'The npm compiler did not include the Kotlin player.')
  if (sourceDigest(root) !== inputHash) throw new Error('Sources changed while compiling App resources')
  return { output, manifest, player, sourceHash: inputHash }
}

function offlineSdk() {
  const directory = resolve(process.env.FREETV_DCLOUD_ANDROID_SDK || join(root, '.tools/DCloud-Android-SDK-5.26'))
  const libs = join(directory, 'SDK/libs')
  const hint = `Set FREETV_DCLOUD_ANDROID_SDK to the extracted DCloud Android offline SDK ${sdkVersion}.`
  requireFile(libs, hint)
  const names = readdirSync(libs)
  const required = [
    /^lib\.5plus\.base-release\.aar$/i,
    /^uniapp-v8-release\.aar$/i,
    /^utsplugin-release\.aar$/i,
    /^breakpad-build-release\.aar$/i,
    /^android-gif-drawable-1\.2\.29\.aar$/i,
    /^oaid_sdk_[\d.]+\.aar$/i,
  ]
  const runtimeLibraries = required.map(pattern => {
    const matches = names.filter(name => pattern.test(name))
    if (matches.length !== 1) throw new Error(`Expected one runtime library matching ${pattern} in ${libs}. ${hint}`)
    return join(libs, matches[0])
  })
  const data = join(directory, 'SDK/assets/data')
  requireFile(join(data, 'dcloud_control.xml'), hint)
  return { runtimeLibraries, data }
}

function populateAndroidProject(project, sdk, builds) {
  const [{ manifest }] = builds
  const android = manifest['app-plus'].distribute.android
  const templateDirectory = join(root, 'scripts/android/gradle')
  mkdirSync(project, { recursive: true })
  for (const file of ['build.gradle', 'gradle.properties', 'settings.gradle']) {
    copyFileSync(join(templateDirectory, file), join(project, file))
  }
  writeFileSync(join(project, 'freetv-build.json'), JSON.stringify({
    packageName: android.packagename, minSdk: android.minSdkVersion, abis: android.abiFilters,
    versionName: manifest.versionName, versionCode: Number(manifest.versionCode),
    runtimeLibraries: sdk.runtimeLibraries,
  }))

  const main = join(project, 'src/main')
  const values = join(main, 'res/values')
  const tv = join(project, 'src/tv')
  mkdirSync(values, { recursive: true })
  mkdirSync(tv, { recursive: true })
  copyFileSync(join(templateDirectory, 'styles.xml'), join(values, 'styles.xml'))
  copyFileSync(join(templateDirectory, 'AndroidManifest.tv.xml'), join(tv, 'AndroidManifest.xml'))
  const permissions = android.permissions.map(permission => {
    if (!/^<uses-permission android:name="[A-Za-z0-9._]+"\s*\/>$/.test(permission)) {
      throw new Error('Unsupported permission declaration in src/manifest.json')
    }
    return permission
  })
  writeFileSync(join(main, 'AndroidManifest.xml'), readFileSync(join(templateDirectory, 'AndroidManifest.xml'), 'utf8')
    .replace('<!-- FreeTV permissions -->', permissions.join('\n    ')))

  const data = join(main, 'assets/data')
  cpSync(sdk.data, data, { recursive: true })
  const control = join(data, 'dcloud_control.xml')
  const template = readFileSync(control, 'utf8')
  const appIdPattern = /(<app\s[^>]*?\bappid\s*=\s*)(["'])[^"']*\2/g
  if ([...template.matchAll(appIdPattern)].length !== 1) throw new Error('Unexpected SDK dcloud_control.xml layout')
  writeFileSync(control, template
    .replace(appIdPattern, (_, prefix, quote) => `${prefix}${quote}${manifest.appid}${quote}`)
    .replace(/(\b(?:debug|syncDebug)\s*=\s*)(["'])true\2/g, (_, prefix, quote) => `${prefix}${quote}false${quote}`))

  for (const [density, icon] of Object.entries(readJson(join(root, 'src/manifest.json'))['app-plus'].distribute.icons.android)) {
    const resource = join(main, 'res', `drawable-${density}`)
    mkdirSync(resource, { recursive: true })
    copyFileSync(join(root, 'src', icon), join(resource, 'icon.png'))
  }
  const release = join(project, 'src/release')
  mkdirSync(release, { recursive: true })
  copyFileSync(join(builds[0].player, 'AndroidManifest.xml'), join(release, 'AndroidManifest.xml'))

  for (const { target, output, player } of builds) {
    const variant = join(project, 'src', target)
    const www = join(variant, 'assets/apps', manifest.appid, 'www')
    cpSync(output, www, { recursive: true, filter: path => path !== join(output, 'uni_modules') })
    const runtimeFile = join(www, 'manifest.json')
    const runtime = readJson(runtimeFile)
    delete runtime['@platforms']
    delete runtime.plus.distribute
    writeFileSync(runtimeFile, JSON.stringify(runtime))
    cpSync(join(player, 'src'), join(variant, 'kotlin'), { recursive: true })
    if (target === 'tv') {
      const drawable = join(variant, 'res/drawable')
      mkdirSync(drawable, { recursive: true })
      copyFileSync(join(root, 'src/static/brand/tv-banner.png'), join(drawable, 'tv_banner.png'))
    }
  }
}

function packageOffline(selection) {
  const sdk = offlineSdk()
  const keyFile = join(root, '.signing/dcloud-appkey.txt')
  const appKey = (process.env.FREETV_DCLOUD_APPKEY || readFileSync(requireFile(keyFile,
    'Configure the Android offline AppKey for this AppID, package name, and signing certificate.'), 'utf8')).trim()
  if (!/^[A-Za-z0-9+\/=_.-]{16,4096}$/.test(appKey)) throw new Error('Invalid DCloud offline AppKey format')
  const signing = readJson(requireFile(join(root, '.signing/android-test.json'), 'Configure the existing Android signing key.'))
  for (const name of ['certalias', 'certfile', 'certpassword', 'storepassword']) {
    if (!signing[name]) throw new Error(`Missing Android signing field ${name}`)
  }
  requireFile(signing.certfile, 'Android keystore is missing.')

  const androidSdk = resolve(process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || join(root, '.tools/AndroidSDK'))
  const androidTools = join(androidSdk, 'build-tools/36.0.0')
  const gradle = resolve(process.env.FREETV_GRADLE_HOME || join(root, `.tools/gradle-${gradleVersion}`))
  const javaHome = resolve(process.env.JAVA_HOME || dirname(dirname(hbuilderx(root).java)))
  const java = requireFile(join(javaHome, 'bin', windows ? 'java.exe' : 'java'), 'Set JAVA_HOME to a JDK 17 or newer.')
  const keytool = requireFile(join(javaHome, 'bin', windows ? 'keytool.exe' : 'keytool'), 'A full JDK is required.')
  const signer = requireFile(join(androidTools, 'lib/apksigner.jar'), 'Install Android Build Tools 36.0.0.')
  const aapt2 = requireFile(join(androidTools, windows ? 'aapt2.exe' : 'aapt2'), 'Install Android Build Tools 36.0.0.')
  requireFile(join(androidSdk, 'platforms/android-36/android.jar'), 'Install Android SDK Platform 36.')
  const gradleLauncher = requireFile(join(gradle, `lib/gradle-gradle-cli-main-${gradleVersion}.jar`),
    `Install Gradle ${gradleVersion} or set FREETV_GRADLE_HOME.`)

  mkdirSync(cache, { recursive: true })
  const work = mkdtempSync(join(cache, 'android-offline-'))
  const targets = selection === 'both' ? ['phone', 'tv'] : [selection]
  const builds = targets.map(target => ({ target, ...prepareOfflineResources(target, work) }))
  const project = join(work, 'gradle')
  populateAndroidProject(project, sdk, builds)
  const gradleEnv = { ...process.env, JAVA_HOME: javaHome, ANDROID_HOME: androidSdk, ANDROID_SDK_ROOT: androidSdk,
    GRADLE_USER_HOME: process.env.GRADLE_USER_HOME || join(root, '.tools/gradle-cache'), FREETV_OFFLINE_APPKEY: appKey }
  run(java, ['-Dorg.gradle.appname=gradle', '-jar', gradleLauncher, '--no-daemon', '--console=plain',
    ...targets.map(target => target === 'tv' ? 'assembleTvRelease' : 'assemblePhoneRelease')], {
    cwd: project, env: gradleEnv, secrets: [appKey],
  })

  const secrets = [signing.storepassword, signing.certpassword, appKey]
  const signingEnv = { ...process.env, FREETV_OFFLINE_STORE_PASSWORD: signing.storepassword,
    FREETV_OFFLINE_KEY_PASSWORD: signing.certpassword }
  const expectedSigner = sha256(run(keytool, ['-exportcert', '-keystore', signing.certfile, '-alias', signing.certalias,
    '-storepass:env', 'FREETV_OFFLINE_STORE_PASSWORD'], { env: signingEnv, secrets, quiet: true }))

  const results = builds.map(({ target, manifest, sourceHash }) => {
    if (sourceDigest(root) !== sourceHash) throw new Error('Sources changed during Gradle packaging')
    const folder = join(project, `build/outputs/apk/${target}/release`)
    const apks = readdirSync(folder).filter(name => name.endsWith('-unsigned.apk'))
    if (apks.length !== 1) throw new Error(`Expected exactly one unsigned ${target} APK`)
    const filename = `FreeTV-${manifest.versionName}-${target}.apk`
    const candidate = join(work, filename)
    run(java, ['-jar', signer, 'sign', '--ks', signing.certfile, '--ks-key-alias', signing.certalias,
      '--ks-pass', 'env:FREETV_OFFLINE_STORE_PASSWORD', '--key-pass', 'env:FREETV_OFFLINE_KEY_PASSWORD',
      '--v4-signing-enabled', 'false', '--out', candidate, join(folder, apks[0])], { env: signingEnv, secrets })
    const signature = run(java, ['-jar', signer, 'verify', '--print-certs', candidate], { quiet: true }).toString()
    const certificate = /certificate SHA-256 digest: ([a-f0-9]{64})/i.exec(signature)?.[1]?.toLowerCase()
    if (certificate !== expectedSigner) throw new Error(`Unexpected signer for ${target}`)
    const badging = run(aapt2, ['dump', 'badging', candidate], { quiet: true }).toString()
    const packageName = manifest['app-plus'].distribute.android.packagename
    const versionCode = Number(manifest.versionCode)
    if (!badging.includes(`package: name='${packageName}' versionCode='${versionCode}' versionName='${manifest.versionName}'`) ||
        !badging.split(/\r?\n/).includes(`application-label:'${manifest.name}'`) ||
        badging.includes('leanback-launchable-activity:') !== (target === 'tv')) {
      throw new Error(`Unexpected APK identity, label, or launcher for ${target}`)
    }
    return { target, version: manifest.versionName, versionCode, filename, candidate, sourceHash,
      sha256: sha256(readFileSync(candidate)), certificateSha256: certificate, gradleVersion, sdkVersion }
  })

  for (const { candidate, filename, ...receipt } of results) {
    const output = join(root, 'artifacts/offline', receipt.target)
    mkdirSync(output, { recursive: true })
    const apk = join(output, filename)
    copyFileSync(candidate, apk)
    writeFileSync(join(output, 'offline-build-receipt.json'), JSON.stringify({ ...receipt, apk, at: new Date().toISOString() }, null, 2))
    console.log(`Verified signed ${receipt.target} APK at ${apk} (certificate SHA-256: ${receipt.certificateSha256})`)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const target = process.argv[2] || 'both'
  if (!['both', 'phone', 'tv'].includes(target) || process.argv.length > 3) {
    throw new Error('Usage: npm run pack:offline -- [both|phone|tv]')
  }
  packageOffline(target)
}
