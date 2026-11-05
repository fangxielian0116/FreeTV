// Local resource-only rebuild. Native changes must use the normal cloud build.
import {readFileSync,writeFileSync,readdirSync,mkdirSync,cpSync,rmSync,existsSync} from 'node:fs'
import {resolve,join,sep} from 'node:path'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import AdmZip from 'adm-zip'

const root=resolve(import.meta.dirname,'..'),out=join(root,'artifacts/0.2.0')
const label=process.argv.find(value=>value.startsWith('--label='))?.slice(8)||'ui-fix'
if(!/^[a-z0-9-]+$/.test(label))throw new Error('Invalid local build label')
const baseline=join(out,'FreeTV-0.2.0-phone-startup-optimized.apk')
const baselineReceipt=join(out,'startup-optimized-build-receipt.json')
const previous=JSON.parse(readFileSync(existsSync(baselineReceipt)?baselineReceipt:join(out,'apk-build-receipt.json'),'utf8'))
const input=JSON.parse(readFileSync(join(out,'build-input.json'),'utf8'))
const sha=body=>createHash('sha256').update(body).digest('hex')
function check(value,message){if(!value)throw new Error(message)}
check(sha(readFileSync(baseline))==='641c1c6242e7993f93da12c80472043c8da0d642bfab45e72fd977eab28ebc28','Unexpected native baseline')
check(previous.sha256===sha(readFileSync(baseline)),'Build receipt does not describe the native baseline')
if(!existsSync(baselineReceipt))writeFileSync(baselineReceipt,JSON.stringify(previous,null,2))
check(JSON.stringify(previous.nativeFiles)===JSON.stringify(input.nativeFiles),'Native modules changed; a cloud build is required')
for(const file of previous.nativeFiles)check(sha(readFileSync(join(root,'src',file.name)))===file.sha256,'Native input changed: '+file.name)
const digest=createHash('sha256')
function sources(directory){for(const entry of readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const file=join(directory,entry.name);if(entry.isDirectory())sources(file);else digest.update(file.slice(root.length+1).replaceAll('\\','/')).update('\0').update(readFileSync(file)).update('\0')}}
sources(join(root,'src'))
for(const name of ['package.json','package-lock.json','vite.config.ts','tsconfig.json','index.html'])digest.update(name).update('\0').update(readFileSync(join(root,name))).update('\0')
const sourceHash=digest.digest('hex')
const manifest=JSON.parse(readFileSync(join(root,'src/manifest.json'),'utf8'))
const nativeConfig=JSON.parse(JSON.stringify(manifest));delete nativeConfig['app-plus'].distribute.icons;delete nativeConfig.h5
check(sha(JSON.stringify(nativeConfig))==='1f1e322a297627cf3de6465241663596297b22b53f68c2587ba83a512bb987f9','Native manifest config changed; a cloud build is required')
const android=manifest['app-plus'].distribute.android
check(manifest.appid==='__UNI__E70B510'&&manifest.versionName==='0.2.0'&&String(manifest.versionCode)==='200'&&android.packagename==='com.fxl.freetv.demo'&&android.minSdkVersion===23,'Native identity changed')
const plugins=join(root,'.tools/HBuilderX-5.26/HBuilderX/plugins'),java=join(plugins,'amazon-corretto/bin/java.exe')
const signing=JSON.parse(readFileSync(join(root,'.signing/android-test.json'),'utf8'))
function run(binary,args){const result=spawnSync(binary,args,{cwd:root,encoding:'utf8',windowsHide:true});let output=result.stdout+result.stderr;for(const value of [signing.certpassword,signing.storepassword])output=output.split(value).join('[REDACTED]');if(result.status!==0)throw new Error(output);return output}
console.log('Compiling current application resources locally.')
writeFileSync(join(out,`${label}-compile.log`),run(process.execPath,[join(root,'node_modules/@dcloudio/vite-plugin-uni/bin/uni.js'),'build','-p','app']))
const work=join(root,'.cache',`ui-apk-${Date.now()}`),decoded=join(work,'decoded'),framework=join(work,'framework')
mkdirSync(framework,{recursive:true})
console.log('Decoding resources; preserving compiled native classes and libraries.')
writeFileSync(join(out,`${label}-resources.log`),run(java,['-jar',join(plugins,'app-safe-pack/apktool.jar'),'d','-s','-p',framework,'-o',decoded,baseline]))
const www=join(decoded,'assets/apps',manifest.appid,'www'),compiled=join(root,'dist/build/app')
check(www.startsWith(work+sep),'Unsafe resource path')
rmSync(www,{recursive:true,force:true});cpSync(compiled,www,{recursive:true})
// Match the vendor safe pack's runtime manifest: native distribution config is
// build-time only. Never ship local signing metadata or absolute asset paths.
const runtime=JSON.parse(readFileSync(join(www,'manifest.json'),'utf8'))
const oldRuntime=JSON.parse(new AdmZip(baseline).readAsText(`assets/apps/${manifest.appid}/www/manifest.json`))
delete runtime['@platforms'];delete runtime.plus.distribute
runtime.plus.adid=oldRuntime.plus.adid;runtime.plus.channel=oldRuntime.plus.channel
writeFileSync(join(www,'manifest.json'),JSON.stringify(runtime))
for(const density of ['mdpi','hdpi','xhdpi','xxhdpi','xxxhdpi']){
  const destination=join(decoded,'res',`drawable-${density}`);mkdirSync(destination,{recursive:true})
  cpSync(join(root,'src/static/brand',`android-${density}.png`),join(destination,'icon.png'))
}
const unsigned=join(work,'unsigned.apk'),aligned=join(work,'aligned.apk'),apk=join(out,`FreeTV-0.2.0-phone-${label}.apk`)
console.log('Building launcher resources and adding the current compiled pages.')
writeFileSync(join(out,`${label}-resources.log`),run(java,['-jar',join(plugins,'app-safe-pack/apktool.jar'),'b','-p',framework,'-o',unsigned,decoded]),{flag:'a'})
run(join(plugins,'app-safe-pack/zipalign/zipalign.exe'),['-f','4',unsigned,aligned])
run(java,['-jar',join(plugins,'app-safe-pack/apksigner.jar'),'sign','--ks',signing.certfile,'--ks-key-alias',signing.certalias,'--ks-pass','pass:'+signing.storepassword,'--key-pass','pass:'+signing.certpassword,'--out',apk,aligned])
const signature=run(java,['-jar',join(plugins,'app-safe-pack/apksigner.jar'),'verify','--print-certs',apk])
const cert=/certificate SHA-256 digest: ([a-f0-9]+)/i.exec(signature)?.[1]
check(cert==='5f38bce6ad6d0c3d2b647464d05d225e7336d06f8f582a9a8e10051fec7b5c34','Signing identity changed')
const oldZip=new AdmZip(baseline),newZip=new AdmZip(apk),nativeEntries=oldZip.getEntries().filter(entry=>/^(?:classes\d*\.dex|lib\/.*|assets\/.*\.dex)$/.test(entry.entryName))
for(const entry of nativeEntries)check(sha(oldZip.readFile(entry))===sha(newZip.readFile(entry.entryName)),'Native output changed: '+entry.entryName)
const receipt={at:new Date().toISOString(),method:'local resource rebuild with unchanged verified native code',apk,sha256:sha(readFileSync(apk)),sourceHash,certificateSha256:cert,nativeBase:{apk:baseline,sha256:sha(readFileSync(baseline))},nativeEntriesUnchanged:nativeEntries.length,nativeFiles:input.nativeFiles}
writeFileSync(join(out,`${label}-build-receipt.json`),JSON.stringify(receipt,null,2))
console.log('Verified same certificate and '+nativeEntries.length+' unchanged native entries. APK: '+apk)
