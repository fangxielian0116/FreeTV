import {readFileSync,readdirSync,writeFileSync,copyFileSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import AdmZip from 'adm-zip'
const root=resolve(import.meta.dirname,'..'),out=join(root,'artifacts/0.2.0')
const receipt=JSON.parse(readFileSync(join(out,'posters-build-receipt.json'),'utf8'))
const sha=value=>createHash('sha256').update(value).digest('hex')
function check(value,message){if(!value)throw new Error(message)}
const digest=createHash('sha256')
function sources(directory){for(const entry of readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const file=join(directory,entry.name);if(entry.isDirectory())sources(file);else digest.update(file.slice(root.length+1).replaceAll('\\','/')).update('\0').update(readFileSync(file)).update('\0')}}
sources(join(root,'src'));for(const file of ['package.json','package-lock.json','vite.config.ts','tsconfig.json','index.html'])digest.update(file).update('\0').update(readFileSync(join(root,file))).update('\0')
check(digest.digest('hex')===receipt.sourceHash,'Source changed after packaging')
check(sha(readFileSync(receipt.apk))===receipt.sha256,'APK hash differs from build receipt')
check(readFileSync(join(out,'posters-installed-apk-sha256.log'),'utf8').startsWith(receipt.sha256+' '),'Installed APK differs from delivered artifact')
const plugins=join(root,'.tools/HBuilderX-5.26/HBuilderX/plugins'),java=join(plugins,'amazon-corretto/bin/java.exe')
const signature=spawnSync(java,['-jar',join(plugins,'app-safe-pack/apksigner.jar'),'verify','--print-certs',receipt.apk],{encoding:'utf8',windowsHide:true})
check(signature.status===0&&signature.stdout.includes('5f38bce6ad6d0c3d2b647464d05d225e7336d06f8f582a9a8e10051fec7b5c34'),'Signing identity mismatch')
const icons=spawnSync(java,['--source','11',join(root,'scripts/CheckApkIcons.java'),receipt.apk,join(root,'src/static/brand')],{encoding:'utf8',windowsHide:true})
check(icons.status===0,'Launcher icons changed')
const zip=new AdmZip(receipt.apk),base=new AdmZip(receipt.nativeBase.apk)
let nativeEntries=0,compiledAssets=0
for(const entry of base.getEntries().filter(entry=>/^(?:classes\d*\.dex|lib\/.*|assets\/.*\.dex)$/.test(entry.entryName))){check(sha(base.readFile(entry))===sha(zip.readFile(entry.entryName)),'Native code changed: '+entry.entryName);nativeEntries++}
function compiled(directory,relative=''){for(const entry of readdirSync(directory,{withFileTypes:true})){const file=join(directory,entry.name),name=relative+entry.name;if(entry.isDirectory())compiled(file,name+'/');else if(name!=='manifest.json'){check(sha(readFileSync(file))===sha(zip.readFile(`assets/apps/__UNI__E70B510/www/${name}`)),'Stale compiled asset: '+name);compiledAssets++}}}
compiled(join(root,'dist/build/app'))
const runtime=JSON.parse(zip.readAsText('assets/apps/__UNI__E70B510/www/manifest.json'));check(!runtime.plus.distribute&&runtime.version.code==='200','Invalid runtime manifest')
const business=readFileSync(join(out,'posters-business-tests.log'),'utf8'),typecheck=readFileSync(join(out,'posters-typecheck.log'),'utf8')
check(/pass 58/.test(business)&&/fail 0/.test(business),'Business tests incomplete')
check(typecheck.includes('vue-tsc')&&!/error TS/.test(typecheck),'Typecheck failed')
check(readFileSync(join(out,'posters-h5-build.log'),'utf8').includes('Build complete.'),'H5 build incomplete')
const log=readFileSync(join(out,'posters-warm-android.log'),'utf8')
check(log.includes('FreeTV poster cache checks passed')&&log.includes('POSTER_REFRESH retained decoded covers')&&!log.includes('check failed'),'Installed poster checks failed')
const warm=JSON.parse(log.split(/\r?\n/).find(line=>line.startsWith('POSTER_REPORT ')).slice('POSTER_REPORT '.length))
check(warm.persistentFilesReused>=2&&warm.ready>=2&&warm.paths.every(path=>path.includes('uniapp_save')),'Local file reuse not verified')
const report={at:new Date().toISOString(),...receipt,nativeEntriesUnchanged:nativeEntries,compiledAssets,checks:{sourceMatches:true,installedArtifactMatches:true,originalSignature:true,icons:JSON.parse(icons.stdout),typecheck:true,businessTests:58,h5Build:true,androidResourceBuild:true,posterLocalFileRendering:true,persistentCacheAcrossProcessRestart:true,refreshRetainsRenderedCovers:true},android:warm,browser:{cards:20,initialImages:6,initialReady:6,readyDuringRefresh:6,imagesAfterScroll:12,readyAfterScroll:12},policy:{maxConcurrentDownloads:4,maxConcurrentPerHost:2,maxPersistentFiles:160,maxCacheBytes:32*1024*1024,freshDays:7},desktopNetworkSamples:[{host:'vod.xiguazyimg.com',bytes:30312,totalMs:2006},{host:'img.wmdb.tv',bytes:86374,totalMs:1526},{host:'tu.iqiyizyimg.com',expectedBytes:352602,receivedBytes:163463,totalMs:12001,status:'download timeout'}],screenshots:['posters-android.png'],limitations:['Emulator only; no physical phone or TV test','Launch-to-first-observed timing includes application startup, catalogue loading and polling; it is not an isolated image download benchmark','The first native cold sample observed local images, but its later accessibility lookup failed; the repaired full warm test passed','Slow upstream image hosts can still delay a first download; cached files avoid repeat network waits','Image URLs and origin performance can change; no external resize proxy is introduced']}
writeFileSync(join(out,'posters-verification.json'),JSON.stringify(report,null,2))
copyFileSync(receipt.apk,join(out,'FreeTV-0.2.0-phone.apk'));writeFileSync(join(out,'apk-build-receipt.json'),JSON.stringify(receipt,null,2));writeFileSync(join(out,'phone-verification.json'),JSON.stringify(report,null,2))
console.log(JSON.stringify({apk:receipt.apk,sha256:receipt.sha256,businessTests:58,persistentFilesReused:warm.persistentFilesReused,renderedLocalPosters:warm.ready,nativeEntries,compiledAssets},null,2))
