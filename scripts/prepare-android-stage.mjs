import { existsSync, mkdirSync, cpSync, writeFileSync, readFileSync, rmSync, symlinkSync, readdirSync } from 'node:fs'
import { resolve,join,sep } from 'node:path'
import {compilePlayerLibrary} from './compile-player-library.mjs'
const appVersion = JSON.parse(readFileSync(new URL('../src/manifest.json', import.meta.url), 'utf8'))
export const TV_VERSION = appVersion.versionName, TV_VERSION_CODE = Number(appVersion.versionCode)
export function prepareAndroidStage(root, target = 'phone', preview = false, options = {}) {
  if (!['phone','tv'].includes(target)) throw new Error('Unknown Android target')
  const defaultStage = target==='tv'?(preview?'.cache/android-tv-preview-stage':'.cache/android-tv-stage'):(preview?'.cache/android-phone-preview-stage':'.cache/android-stage')
  const stage = resolve(root, options.stageDirectory ?? defaultStage), marker = join(stage,'.freetv-generated')
  if (!stage.startsWith(resolve(root)+sep)) throw new Error('Build staging path is outside the workspace.')
  mkdirSync(stage,{recursive:true})
  if (existsSync(marker) && readFileSync(marker,'utf8') !== resolve(root)) throw new Error('Unknown build staging ownership.')
  const stagedSource = join(stage,'src')
  if (existsSync(stagedSource)) {
    if (!existsSync(marker)) throw new Error('Refusing to replace an unmarked build directory.')
    rmSync(stagedSource,{recursive:true,force:true})
  }
  writeFileSync(marker,resolve(root))
  cpSync(join(root,'src'),stagedSource,{recursive:true})
  // HBuilderX's native pack validator resolves icons from the CLI project root,
  // whereas uni-app source assets are relative to src/manifest.json.
  const manifestPath = join(stagedSource,'manifest.json'), manifest = JSON.parse(readFileSync(manifestPath,'utf8'))
  if (options.compileNative !== false) {
    const nativeLibrary=compilePlayerLibrary(root)
    const native=join(stagedSource,'uni_modules/freetv-player/utssdk/app-android')
    const libs=join(native,'libs');mkdirSync(libs,{recursive:true})
    cpSync(nativeLibrary.output,join(libs,'freetv-player.jar'))
    // The cloud packager gets a precompiled JAR. Gradle builds Kotlin from source.
    for(const file of readdirSync(native).filter(name=>name.endsWith('.kt')))rmSync(join(native,file))
    writeFileSync(join(stage,'native-library-receipt.json'),JSON.stringify(nativeLibrary,null,2))
  }
  if(target==='phone'){
    // uni-app resolves some @ imports before Vite aliases. Substitute only the
    // disposable phone staging files so every packer excludes TV dependencies.
    cpSync(join(root,'src/services/title-index.phone.ts'),join(stagedSource,'services/title-index.ts'))
    for(const component of ['TVNavigation.vue','TVSearch.vue'])cpSync(join(root,'src/components/TVDisabled.vue'),join(stagedSource,'components',component))
    cpSync(join(root,'src/styles/tv-disabled.css'),join(stagedSource,'styles/tv.css'))
  }
  if (target==='tv') {
    manifest['app-plus'].screenOrientation=['landscape-primary','landscape-secondary']
    const pages=JSON.parse(readFileSync(join(stagedSource,'pages.json'),'utf8'))
    for(const page of pages.pages)page.style.navigationStyle='custom'
    pages.globalStyle.backgroundColor='#101b2b'
    writeFileSync(join(stagedSource,'pages.json'),JSON.stringify(pages,null,2))
    writeFileSync(join(stagedSource,'AndroidManifest.xml'),`<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools" package="com.fxl.freetv.demo">
      <uses-feature android:name="android.hardware.touchscreen" android:required="false"/>
      <uses-feature android:name="android.software.leanback" android:required="false"/>
      <application android:banner="@drawable/tv_banner">
        <activity android:name="io.dcloud.PandoraEntry"><intent-filter><action android:name="android.intent.action.MAIN"/><category android:name="android.intent.category.LEANBACK_LAUNCHER"/></intent-filter></activity>
      </application></manifest>`)
    cpSync(join(stagedSource,'AndroidManifest.xml'),join(stage,'AndroidManifest.xml'))
    const drawable=join(stage,'nativeResources/android/res/drawable');mkdirSync(drawable,{recursive:true})
    cpSync(join(root,'src/static/brand/tv-banner.png'),join(drawable,'tv_banner.png'))
  }
  for (const [density,path] of Object.entries(manifest['app-plus'].distribute.icons.android)) {
    const icon = resolve(stagedSource,path)
    if (!icon.startsWith(stagedSource+sep) || !existsSync(icon)) throw new Error('Missing Android launcher icon: '+density)
    manifest['app-plus'].distribute.icons.android[density] = icon.replaceAll('\\','/')
  }
  writeFileSync(manifestPath,JSON.stringify(manifest,null,2))
  for (const file of ['package.json','package-lock.json','tsconfig.json','vite.config.ts','index.html']) cpSync(join(root,file),join(stage,file))
  const vite=readFileSync(join(stage,'vite.config.ts'),'utf8')
  if(!vite.includes("const tvBuild = process.env.FREETV_TARGET === 'tv'"))throw Error('TV build target marker is missing')
  writeFileSync(join(stage,'vite.config.ts'),vite.replace("const tvBuild = process.env.FREETV_TARGET === 'tv'",`const tvBuild = ${target==='tv'}`))
  if (!existsSync(join(stage,'node_modules'))) symlinkSync(join(root,'node_modules'),join(stage,'node_modules'),'junction')
  return stage
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) console.log(prepareAndroidStage(resolve(import.meta.dirname,'..')))
