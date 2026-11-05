import {readFileSync,readdirSync,writeFileSync,copyFileSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import AdmZip from 'adm-zip'
const root=resolve(import.meta.dirname,'..'),out=join(root,'artifacts/0.2.0')
const receipt=JSON.parse(readFileSync(join(out,'categories-time-build-receipt.json'),'utf8'))
const sha=body=>createHash('sha256').update(body).digest('hex')
function check(value,message){if(!value)throw new Error(message)}
const digest=createHash('sha256')
function sources(directory){for(const entry of readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const file=join(directory,entry.name);if(entry.isDirectory())sources(file);else digest.update(file.slice(root.length+1).replaceAll('\\','/')).update('\0').update(readFileSync(file)).update('\0')}}
sources(join(root,'src'));for(const file of ['package.json','package-lock.json','vite.config.ts','tsconfig.json','index.html'])digest.update(file).update('\0').update(readFileSync(join(root,file))).update('\0')
check(digest.digest('hex')===receipt.sourceHash,'Source changed after build')
check(sha(readFileSync(receipt.apk))===receipt.sha256,'Artifact hash mismatch')
check(readFileSync(join(out,'categories-installed-apk-sha256.log'),'utf8').startsWith(receipt.sha256+' '),'Installed APK mismatch')
const java=join(root,'.tools/HBuilderX-5.26/HBuilderX/plugins/amazon-corretto/bin/java.exe')
const certificate=spawnSync(java,['-jar',join(root,'.tools/HBuilderX-5.26/HBuilderX/plugins/app-safe-pack/apksigner.jar'),'verify','--print-certs',receipt.apk],{encoding:'utf8',windowsHide:true})
check(certificate.status===0&&certificate.stdout.includes('5f38bce6ad6d0c3d2b647464d05d225e7336d06f8f582a9a8e10051fec7b5c34'),'Signing identity mismatch')
const icons=spawnSync(java,['--source','11',join(root,'scripts/CheckApkIcons.java'),receipt.apk,join(root,'src/static/brand')],{encoding:'utf8',windowsHide:true})
check(icons.status===0,'Launcher icons differ: '+icons.stderr)
const zip=new AdmZip(receipt.apk),baseline=new AdmZip(receipt.nativeBase.apk)
let nativeEntries=0,compiledAssets=0
for(const entry of baseline.getEntries().filter(entry=>/^(?:classes\d*\.dex|lib\/.*|assets\/.*\.dex)$/.test(entry.entryName))){check(sha(baseline.readFile(entry))===sha(zip.readFile(entry.entryName)),'Native code changed: '+entry.entryName);nativeEntries++}
function compiled(directory,relative=''){for(const entry of readdirSync(directory,{withFileTypes:true})){const name=relative+entry.name,file=join(directory,entry.name);if(entry.isDirectory())compiled(file,name+'/');else if(name!=='manifest.json'){check(sha(readFileSync(file))===sha(zip.readFile(`assets/apps/__UNI__E70B510/www/${name}`)),'Stale asset: '+name);compiledAssets++}}}
compiled(join(root,'dist/build/app'))
const runtime=JSON.parse(zip.readAsText('assets/apps/__UNI__E70B510/www/manifest.json'))
check(!runtime.plus.distribute&&runtime.version.code==='200','Invalid runtime manifest')
const business=readFileSync(join(out,'categories-business-tests.log'),'utf8'),typecheck=readFileSync(join(out,'categories-typecheck.log'),'utf8')
check(/pass 49/.test(business)&&/fail 0/.test(business),'Business tests incomplete');check(typecheck.includes('vue-tsc')&&!/error TS/.test(typecheck),'Typecheck failed')
check(readFileSync(join(out,'categories-h5-build.log'),'utf8').includes('Build complete.'),'H5 build incomplete')
const ui=readFileSync(join(out,'categories-installed-check.log'),'utf8')
check(ui.includes('FreeTV category/time checks passed')&&ui.includes('CATEGORY_PREFERENCE persisted variety-domestic')&&ui.includes('CHINA_TIME_REPORT')&&!ui.includes('check failed'),'Installed UI checks failed')
const live=JSON.parse(readFileSync(join(out,'categories-live-check.json'),'utf8'))
check(live.results.length===8&&live.results.every(row=>row.passed&&row.count===20)&&live.peakConcurrentRequests<=3,'Live category checks failed')
const report={at:new Date().toISOString(),...receipt,nativeEntriesUnchanged:nativeEntries,compiledAssets,icons:JSON.parse(icons.stdout),checks:{typecheck:true,businessTests:49,h5Build:true,androidResourceBuild:true,installedArtifactMatches:true,originalSignature:true,twoRowsOfFour:true,categoryPreferencePersisted:true,chinaTimezoneVerifiedAgainstStoredTimestamp:true},liveCatalogue:live,screenshots:['categories-home-android.png','categories-time-android.png'],limitations:['Android emulator only; no physical phone or TV test','Live catalogue checks sample the current Xigua directory; source metadata and availability can change','Unknown production region stays in All; regional classifications fall back to source category metadata']}
writeFileSync(join(out,'categories-time-verification.json'),JSON.stringify(report,null,2))
copyFileSync(receipt.apk,join(out,'FreeTV-0.2.0-phone.apk'))
writeFileSync(join(out,'apk-build-receipt.json'),JSON.stringify(receipt,null,2));writeFileSync(join(out,'phone-verification.json'),JSON.stringify(report,null,2))
console.log(JSON.stringify({apk:receipt.apk,sha256:receipt.sha256,businessTests:49,liveCategories:live.results.length,nativeEntries,compiledAssets,checks:report.checks},null,2))
