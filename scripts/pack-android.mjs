import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import AdmZip from 'adm-zip'
import { prepareAndroidStage } from './prepare-android-stage.mjs'
import { hbuilderx } from './hbuilderx.mjs'

const root = resolve(import.meta.dirname, '..')
const target=process.argv.includes('--tv')?'tv':'phone'
const project = target==='tv'||process.argv.includes('--staged') ? prepareAndroidStage(root,target) : root
const customBase = process.argv.includes('--debug-base')
if (customBase) throw new Error('Cloud custom debug bases do not support safe packing. This path is disabled; use npm run pack:android instead.')
const { cli } = hbuilderx(root)
const signingFile = join(root, '.signing/android-test.json')
if (!existsSync(cli)) throw new Error('Install HBuilderX or set FREETV_HBUILDERX to its executable.')
if (!existsSync(signingFile)) throw new Error('Run node scripts/prepare-android-signing.mjs first.')
const signing = JSON.parse(readFileSync(signingFile, 'utf8'))
const manifest = JSON.parse(readFileSync(join(project, 'src/manifest.json'), 'utf8'))
const nativeLibrary = JSON.parse(readFileSync(join(project,'native-library-receipt.json'),'utf8'))
if (!manifest.appid) throw new Error('Generate the DCloud AppID in HBuilderX first.')
if (!existsSync(signing.certfile)) throw new Error('Local signing keystore is missing.')
const artifactDir = join(root,target==='tv'?'artifacts/tv':'artifacts/phone'); mkdirSync(artifactDir,{recursive:true})
const sourceDigest = createHash('sha256')
function hashSources(directory) {
  for (const entry of readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
    const file = join(directory,entry.name)
    if (entry.isDirectory()) hashSources(file)
    else sourceDigest.update(file.slice(root.length+1).replaceAll('\\','/')).update('\0').update(readFileSync(file)).update('\0')
  }
}
hashSources(join(root,'src'))
for (const name of ['package.json','package-lock.json','vite.config.ts','tsconfig.json','index.html']) sourceDigest.update(name).update('\0').update(readFileSync(join(root,name))).update('\0')
const sourceHash = sourceDigest.digest('hex')
const archive = new AdmZip(), nativeFiles = []
function addNative(directory) {
  for (const entry of readdirSync(directory,{withFileTypes:true})) {
    const file = join(directory,entry.name)
    if (entry.isDirectory()) addNative(file)
    else { const name = file.slice(join(root,'src').length+1).replaceAll('\\','/'), body=readFileSync(file); archive.addFile(name,body); nativeFiles.push({name,sha256:createHash('sha256').update(body).digest('hex')}) }
  }
}
addNative(join(root,'src/uni_modules/freetv-player'))
archive.addFile('manifest-android.json',Buffer.from(JSON.stringify({appid:manifest.appid,versionName:manifest.versionName,versionCode:manifest.versionCode,android:manifest['app-plus'].distribute.android},null,2)))
archive.writeZip(join(artifactDir,'native-build-input.zip'))
writeFileSync(join(artifactDir,'build-input.json'),JSON.stringify({at:new Date().toISOString(),version:manifest.versionName,sourceHash,nativeFiles,nativeLibrary},null,2))
const args = ['pack', '--project', project, '--platform', 'android',
  '--android.packagename', 'com.fxl.freetv.demo', '--android.androidpacktype', '0',
  '--safemode', 'true', '--iscustom', String(customBase), '--isconfusion', 'false',
  '--splashads', 'false', '--rpads', 'false', '--unimpads', 'false']
for (const key of ['certalias', 'certfile', 'certpassword', 'storepassword']) args.push(`--android.${key}`, signing[key])
console.log(`Building FreeTV ${manifest.versionName} ${target} APK with GSY/Media3 and the existing signing identity.`)
const imported=spawnSync(cli,['project','open','--path',project],{cwd:root,windowsHide:true,encoding:'utf8',timeout:60000})
if(imported.status!==0)throw new Error('HBuilderX project import failed: '+safeOutput(String(imported.error||'')+'\n'+imported.stdout+imported.stderr))
const child = spawn(cli, args, { cwd: project, windowsHide: true })
let generated = false
let generatedPath = ''
const firstOutput = setTimeout(() => { console.error('HBuilderX did not respond within 90 seconds; the local CLI client was stopped. Check build status before retrying.'); child.kill(); process.exitCode=1 },90000)
firstOutput.unref()
function safeOutput(chunk) {
  let text = chunk.toString()
  for (const value of [signing.certpassword, signing.storepassword]) text = text.split(value).join('[REDACTED]')
  return text.replace(/[\w.+-]+@[\w.-]+\.[a-zA-Z]+/g, '[DCloud account]')
    .replace(/([?&](?:token|access_token|auth|ticket|password)=)[^&\s"'<>)]*/gi, '$1[REDACTED]')
}
// Buffer complete lines so credentials split across process chunks remain redacted.
function forward(stream, output) {
  let pending = ''
  const emit = line => {
    clearTimeout(firstOutput)
    if (/制作结果：Succeed|打包成功\s+安装包位置/.test(line)) generated = true
    const location = /安装包位置：\s*(.+?\.apk)/.exec(line)?.[1]
    if (location) { const file = resolve(location); if (file.startsWith(resolve(project,'dist/release/apk')+sep)) generatedPath = file }
    if (/^\d{2}:\d{2}:\d{2}\.\d+\s+\d+\s+.*\(OK(?: - compressed)?\)\s*$/.test(line)) return
    output.write(safeOutput(line) + '\n')
  }
  stream.setEncoding('utf8')
  stream.on('data', chunk => { const lines = (pending + chunk).split(/\r?\n/); pending = lines.pop(); lines.forEach(emit) })
  stream.on('end', () => { if (pending) emit(pending) })
}
forward(child.stdout, process.stdout)
forward(child.stderr, process.stderr)
child.on('error', () => { console.error('Unable to start HBuilderX CLI.'); process.exitCode = 1 })
child.on('close', (code) => {
  clearTimeout(firstOutput)
  const success = code === 0 && generated && generatedPath && existsSync(generatedPath)
  process.exitCode = success ? 0 : 1
  if (success) {
    const output = join(artifactDir,`FreeTV-${manifest.versionName}-${target}.apk`); copyFileSync(generatedPath,output)
    writeFileSync(join(artifactDir,'apk-build-receipt.json'),JSON.stringify({at:new Date().toISOString(),target,apk:output,sha256:createHash('sha256').update(readFileSync(output)).digest('hex'),sourceHash,nativeFiles,nativeLibrary,stagedManifestSha256:createHash('sha256').update(readFileSync(join(project,'src/manifest.json'))).digest('hex')},null,2))
    console.log('Generated APK copied to: '+output)
  }
  console.log('Check the HBuilderX build result above: a CLI exit code alone does not prove APK generation.')
})
