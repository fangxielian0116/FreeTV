// Native code comes from the signed safe-pack result; only current UI resources are replaced.
import {readFileSync,writeFileSync,mkdirSync,cpSync,rmSync,existsSync} from 'node:fs'
import {join,resolve,sep} from 'node:path'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import AdmZip from 'adm-zip'
import {sourceDigest,digestTree} from './tv-build-input.mjs'
import {TV_VERSION,TV_VERSION_CODE} from './prepare-android-stage.mjs'
const root=resolve(import.meta.dirname,'..'),phone=process.argv.includes('--phone'),target=phone?'phone':'tv'
const manifest=JSON.parse(readFileSync(join(root,'src/manifest.json'),'utf8'))
const version=phone?manifest.versionName:TV_VERSION,versionCode=phone?Number(manifest.versionCode):TV_VERSION_CODE
const nativeArg=process.argv.indexOf('--native-version'),nativeVersion=nativeArg<0?version:process.argv[nativeArg+1]
if(!/^\d+\.\d+\.\d+$/.test(nativeVersion))throw Error('Invalid native baseline version')
const out=join(root,phone?'artifacts/phone':'artifacts/tv'),plugins=join(root,'.tools/HBuilderX-5.26/HBuilderX/plugins')
const receiptPath=join(out,`${nativeVersion}-cloud-native-build-receipt.json`)
if(!existsSync(receiptPath))cpSync(join(out,'apk-build-receipt.json'),receiptPath)
const cloud=JSON.parse(readFileSync(receiptPath,'utf8')),ui=JSON.parse(readFileSync(join(out,'ui-app-build-receipt.json'),'utf8'))
const sha=body=>createHash('sha256').update(body).digest('hex'),check=(value,message)=>{if(!value)throw Error(message)}
check(cloud.target===target,'Native receipt belongs to a different build target')
for(const file of cloud.nativeFiles)check(sha(readFileSync(join(root,'src',file.name)))===file.sha256,'Native code changed after safe-pack: '+file.name)
check(sourceDigest(root)===ui.sourceHash,'UI sources changed after compilation')
check(digestTree(ui.compiled)===ui.compiledHash,'Compiled UI no longer matches receipt')
const base=join(out,`FreeTV-${nativeVersion}-${target}-native.apk`)
if(!existsSync(base))cpSync(cloud.apk,base)
check(sha(readFileSync(base))===cloud.sha256,'Native baseline differs from safe-pack receipt')
const signing=JSON.parse(readFileSync(join(root,'.signing/android-test.json'),'utf8')),java=join(plugins,'amazon-corretto/bin/java.exe')
function run(file,args){const result=spawnSync(file,args,{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});if(result.status!==0){let text=result.stdout+result.stderr;for(const secret of [signing.certpassword,signing.storepassword])text=text.split(secret).join('[REDACTED]');throw Error(text)}return result.stdout+result.stderr}
const work=join(root,'.cache/'+target+'-release-'+Date.now()),decoded=join(work,'decoded'),framework=join(work,'framework')
mkdirSync(framework,{recursive:true});run(java,['-jar',join(plugins,'app-safe-pack/apktool.jar'),'d','-s','-p',framework,'-o',decoded,base])
const www=join(decoded,'assets/apps/__UNI__E70B510/www');check(www.startsWith(work+sep),'Unsafe generated resource path')
rmSync(www,{recursive:true,force:true});cpSync(ui.compiled,www,{recursive:true})
const oldZip=new AdmZip(base),runtime=JSON.parse(readFileSync(join(www,'manifest.json'),'utf8')),oldRuntime=JSON.parse(oldZip.readAsText('assets/apps/__UNI__E70B510/www/manifest.json'))
check(Number(runtime.version.code)===versionCode,'Unexpected application version code')
const orientation=runtime.screenOrientation||runtime.plus.screenOrientation||[]
check(orientation.length&&(phone?JSON.stringify(orientation).includes('portrait'):!JSON.stringify(orientation).includes('portrait')),'Unexpected screen orientation')
const yaml=join(decoded,'apktool.yml'),yamlSource=readFileSync(yaml,'utf8')
check(/versionCode:.*$/m.test(yamlSource)&&/versionName:.*$/m.test(yamlSource),'Native version metadata is missing')
writeFileSync(yaml,yamlSource.replace(/versionCode:.*$/m,`versionCode: '${versionCode}'`).replace(/versionName:.*$/m,`versionName: ${version}`))
delete runtime['@platforms'];delete runtime.plus.distribute;runtime.plus.adid=oldRuntime.plus.adid;runtime.plus.channel=oldRuntime.plus.channel
writeFileSync(join(www,'manifest.json'),JSON.stringify(runtime))
const unsigned=join(work,'unsigned.apk'),aligned=join(work,'aligned.apk'),apk=join(out,`FreeTV-${version}-${target}.apk`)
run(java,['-jar',join(plugins,'app-safe-pack/apktool.jar'),'b','-p',framework,'-o',unsigned,decoded]);run(join(plugins,'app-safe-pack/zipalign/zipalign.exe'),['-f','4',unsigned,aligned])
run(java,['-jar',join(plugins,'app-safe-pack/apksigner.jar'),'sign','--ks',signing.certfile,'--ks-key-alias',signing.certalias,'--ks-pass','pass:'+signing.storepassword,'--key-pass','pass:'+signing.certpassword,'--out',apk,aligned])
function cert(path){return /certificate SHA-256 digest: ([a-f0-9]+)/i.exec(run(java,['-jar',join(plugins,'app-safe-pack/apksigner.jar'),'verify','--print-certs',path]))?.[1]}
const certificate=cert(apk);check(certificate&&certificate===cert(base),'Signing identity changed')
check(certificate===cert(join(root,'artifacts/0.2.0/FreeTV-0.2.0-phone-startup-optimized.apk')),'Signing identity differs from the existing phone/TV install identity')
const finalZip=new AdmZip(apk),nativeEntries=oldZip.getEntries().filter(entry=>/^(?:classes\d*\.dex|lib\/.*|assets\/.*\.dex)$/.test(entry.entryName))
for(const entry of nativeEntries)check(sha(oldZip.readFile(entry))===sha(finalZip.readFile(entry.entryName)),'Native output changed: '+entry.entryName)
const result={at:new Date().toISOString(),target,version,versionCode,apk,sha256:sha(readFileSync(apk)),sourceHash:ui.sourceHash,compiledHash:ui.compiledHash,certificateSha256:certificate,nativeBase:{apk:base,sha256:cloud.sha256},nativeEntriesUnchanged:nativeEntries.length,nativeFiles:cloud.nativeFiles,nativeLibrary:cloud.nativeLibrary,method:'verified native build plus current locally compiled UI; updated version metadata; same signing identity'}
writeFileSync(join(out,target+'-build-receipt.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({apk,sha256:result.sha256,nativeEntriesUnchanged:nativeEntries.length},null,2))
