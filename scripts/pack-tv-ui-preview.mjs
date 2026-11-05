// Temporary emulator preview while the native TV build is queued. Never the release artifact.
import {readFileSync,writeFileSync,mkdirSync,cpSync,rmSync,existsSync} from 'node:fs'
import {join,resolve,sep} from 'node:path'
import {spawnSync} from 'node:child_process'
import AdmZip from 'adm-zip'
const root=resolve(import.meta.dirname,'..'),out=join(root,'artifacts/tv'),plugins=join(root,'.tools/HBuilderX-5.26/HBuilderX/plugins')
const base=join(root,'artifacts/0.2.0/FreeTV-0.2.0-phone-startup-optimized.apk'),java=join(plugins,'amazon-corretto/bin/java.exe')
const signing=JSON.parse(readFileSync(join(root,'.signing/android-test.json'),'utf8'))
function run(file,args){const result=spawnSync(file,args,{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});if(result.status!==0){let text=result.stdout+result.stderr;for(const value of [signing.certpassword,signing.storepassword])text=text.split(value).join('[REDACTED]');throw Error(text)}return result.stdout+result.stderr}
const work=join(root,'.cache/tv-ui-preview-cache'),decoded=join(work,'decoded'),framework=join(work,'framework')
mkdirSync(framework,{recursive:true});mkdirSync(out,{recursive:true})
if(!existsSync(decoded))run(java,['-jar',join(plugins,'app-safe-pack/apktool.jar'),'d','-s','-p',framework,'-o',decoded,base])
const compiled=join(root,'dist/build/tv-app'),www=join(decoded,'assets/apps/__UNI__E70B510/www')
if(!existsSync(join(compiled,'app-service.js'))||!www.startsWith(work+sep))throw Error('TV preview inputs unavailable')
rmSync(www,{recursive:true,force:true});cpSync(compiled,www,{recursive:true})
const runtime=JSON.parse(readFileSync(join(www,'manifest.json'),'utf8')),previous=JSON.parse(new AdmZip(base).readAsText('assets/apps/__UNI__E70B510/www/manifest.json'))
delete runtime['@platforms'];delete runtime.plus.distribute;runtime.plus.adid=previous.plus.adid;runtime.plus.channel=previous.plus.channel
writeFileSync(join(www,'manifest.json'),JSON.stringify(runtime))
const path=join(decoded,'AndroidManifest.xml');let xml=readFileSync(path,'utf8')
xml=xml.replace(/\s+android:banner="[^"]*"/g,'').replace(/<uses-feature[^>]*android:name="android\.(?:hardware\.touchscreen|software\.leanback)"[^>]*\/>/g,'').replace(/<category android:name="android.intent.category.LEANBACK_LAUNCHER"\s*\/>/g,'')
xml=xml.replace('<application ','<uses-feature android:name="android.hardware.touchscreen" android:required="false"/><uses-feature android:name="android.software.leanback" android:required="false"/><application android:banner="@drawable/tv_banner" ')
xml=xml.replace('<category android:name="android.intent.category.LAUNCHER"/>','<category android:name="android.intent.category.LAUNCHER"/><category android:name="android.intent.category.LEANBACK_LAUNCHER"/>')
writeFileSync(path,xml)
const yaml=join(decoded,'apktool.yml');writeFileSync(yaml,readFileSync(yaml,'utf8').replace(/versionCode:.*$/m,"versionCode: '300'").replace(/versionName:.*$/m,'versionName: 0.3.0-preview'))
mkdirSync(join(decoded,'res/drawable'),{recursive:true});cpSync(join(root,'src/static/brand/tv-banner.png'),join(decoded,'res/drawable/tv_banner.png'))
const unsigned=join(work,'unsigned.apk'),aligned=join(work,'aligned.apk'),output=join(out,'FreeTV-TV-UI-preview.apk')
run(java,['-jar',join(plugins,'app-safe-pack/apktool.jar'),'b','-p',framework,'-o',unsigned,decoded]);run(join(plugins,'app-safe-pack/zipalign/zipalign.exe'),['-f','4',unsigned,aligned])
run(java,['-jar',join(plugins,'app-safe-pack/apksigner.jar'),'sign','--ks',signing.certfile,'--ks-key-alias',signing.certalias,'--ks-pass','pass:'+signing.storepassword,'--key-pass','pass:'+signing.certpassword,'--out',output,aligned])
console.log('Temporary TV UI preview, phone native baseline (not release): '+output)
