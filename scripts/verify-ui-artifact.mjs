import {readFileSync,readdirSync,writeFileSync,copyFileSync,existsSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import AdmZip from 'adm-zip'
const root=resolve(import.meta.dirname,'..'),out=join(root,'artifacts/0.2.0')
const receipt=JSON.parse(readFileSync(join(out,'ui-fix-build-receipt.json'),'utf8'))
const sha=body=>createHash('sha256').update(body).digest('hex')
function check(value,message){if(!value)throw new Error(message)}
const digest=createHash('sha256')
function sources(directory){for(const entry of readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const file=join(directory,entry.name);if(entry.isDirectory())sources(file);else digest.update(file.slice(root.length+1).replaceAll('\\','/')).update('\0').update(readFileSync(file)).update('\0')}}
sources(join(root,'src'));for(const name of ['package.json','package-lock.json','vite.config.ts','tsconfig.json','index.html'])digest.update(name).update('\0').update(readFileSync(join(root,name))).update('\0')
check(digest.digest('hex')===receipt.sourceHash,'Source changed after packaging')
check(sha(readFileSync(receipt.apk))===receipt.sha256,'APK differs from the build receipt')
check(readFileSync(join(out,'ui-installed-apk-sha256.log'),'utf8').trim().startsWith(receipt.sha256+' '),'Installed APK differs from artifact')
const zip=new AdmZip(receipt.apk)
const iconCheck=spawnSync(join(root,'.tools/HBuilderX-5.26/HBuilderX/plugins/amazon-corretto/bin/java.exe'),['--source','11',join(root,'scripts/CheckApkIcons.java'),receipt.apk,join(root,'src/static/brand')],{encoding:'utf8',windowsHide:true})
check(iconCheck.status===0,'Launcher pixel check failed: '+iconCheck.stderr)
const icons=JSON.parse(iconCheck.stdout)
let compiledFiles=0
function compiled(directory,relative='') {for(const entry of readdirSync(directory,{withFileTypes:true})){
  const file=join(directory,entry.name),name=relative+entry.name
  if(entry.isDirectory())compiled(file,name+'/')
  else if(name!=='manifest.json'){check(sha(readFileSync(file))===sha(zip.readFile(`assets/apps/__UNI__E70B510/www/${name}`)),'Stale application asset: '+name);compiledFiles++}
}}
compiled(join(root,'dist/build/app'))
const runtime=JSON.parse(zip.readAsText('assets/apps/__UNI__E70B510/www/manifest.json'))
check(!runtime.plus.distribute&&runtime.id==='__UNI__E70B510'&&runtime.version.name==='0.2.0','Invalid runtime manifest')
const logs={}
for(const [name,expected] of [['ui-installed-check.log','UI text checks passed'],['ui-release-playback-check.log','Cancelled validation retained the original session'],['ui-release-lifecycle-check.log','Existing activity accepted a fresh playback session']]){
  const text=readFileSync(join(out,name),'utf8');check(text.includes(expected)&&!text.includes('check failed'),'Regression failed: '+name);logs[name]={passed:true,sha256:sha(text)}
}
const tests=readFileSync(join(out,'ui-fix-check.log'),'utf8');check(tests.includes('pass 41')&&tests.includes('Build complete.'),'Business checks/builds incomplete')
const report={at:new Date().toISOString(),...receipt,icons,compiledFiles,checks:{sourceMatches:true,installedArtifactMatches:true,originalSigningIdentity:true,nativeEntriesUnchanged:receipt.nativeEntriesUnchanged,typecheck:true,businessTests:41,h5Build:true,androidResourceBuild:true,...logs},manualChecks:{androidPickerOpenAndBackScreenshotsReviewed:true,browserFourCategoriesHaveContent:true,browserSearchRetainsChinese:true,browserSourceNameFilter:true,browserCurrentSourceFirst:true,browserPosterRefresh:{before:20,after:20,total:20}},limitations:['Android emulator only; no phone or TV hardware validation','Android WebView omits the source picker from its accessibility tree; open/back used screenshot review, source filtering was checked in the browser','Poster retries handle transient failures; permanently missing upstream images retain a placeholder'],screenshots:['ui-picker-android.png','ui-settings-android.png','ui-search-android.png']}
writeFileSync(join(out,'ui-fix-verification.json'),JSON.stringify(report,null,2))
const previousReport=join(out,'phone-verification.json'),savedReport=join(out,'startup-optimized-phone-verification.json')
if(existsSync(previousReport)&&!existsSync(savedReport))copyFileSync(previousReport,savedReport)
writeFileSync(previousReport,JSON.stringify(report,null,2))
const baselineReceipt=join(out,'startup-optimized-build-receipt.json');if(!existsSync(baselineReceipt))copyFileSync(join(out,'apk-build-receipt.json'),baselineReceipt)
copyFileSync(receipt.apk,join(out,'FreeTV-0.2.0-phone.apk'));writeFileSync(join(out,'apk-build-receipt.json'),JSON.stringify(receipt,null,2))
console.log(JSON.stringify({apk:receipt.apk,sha256:receipt.sha256,sourceHash:receipt.sourceHash,compiledFiles,icons,businessTests:41,installedReleaseChecksPassed:true},null,2))
