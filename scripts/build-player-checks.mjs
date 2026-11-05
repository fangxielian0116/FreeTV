import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import AdmZip from 'adm-zip'
const root = resolve(import.meta.dirname,'..'), out = join(root,'.cache/player-checks')
const plugins = join(root,'.tools/HBuilderX-5.26/HBuilderX/plugins')
const java = join(plugins,'amazon-corretto/bin/java.exe'), javac = join(plugins,'amazon-corretto/bin/javac.exe')
const android = join(plugins,'uts-development-android/static/android.jar')
const aapt = join(plugins,'uts-development-android/static/win/aapt2.exe')
const signing = JSON.parse(readFileSync(join(root,'.signing/android-test.json'),'utf8'))
const overlay = process.argv.includes('--native-overlay')
mkdirSync(join(out,'classes'),{recursive:true}); mkdirSync(join(out,'dex'),{recursive:true})
function run(binary,args) { const result = spawnSync(binary,args,{cwd:root,windowsHide:true,encoding:'utf8'}); if (result.status !== 0) throw new Error((result.stdout+result.stderr).split(signing.certpassword).join('[REDACTED]').split(signing.storepassword).join('[REDACTED]')); }
run(javac,['-encoding','UTF-8','-source','8','-target','8','-classpath',android,'-d',join(out,'classes'),join(root,'tests/android/PlayerChecks.java'),join(root,'tests/android/TVChecks.java')])
const classpath = overlay ? readFileSync(join(root,'.cache/native-check/classpath.txt'),'utf8').trim().split(';').filter(path=>path!==android).flatMap(path=>['--classpath',path]) : []
run(java,['-cp',join(root,'.tools/AndroidSDK/cmdline-tools/latest/lib/d8-classpath.jar'),'com.android.tools.r8.D8','--min-api','23','--lib',android,...classpath,'--output',join(out,'dex'),join(out,'classes/com/fxl/freetv/test/PlayerChecks.class'),join(out,'classes/com/fxl/freetv/test/TVChecks.class'),...(overlay?[join(root,'.cache/native-check/player-check.jar')]:[])])
const apk = join(out,'checks-unsigned.apk')
run(aapt,['link','-I',android,'--manifest',join(root,'tests/android/AndroidManifest.xml'),'-o',apk])
const zip = new AdmZip(apk); zip.addLocalFile(join(out,'dex/classes.dex'))
const sourceInput=join(root,'artifacts/0.2.0/source-playback-input.json');if(existsSync(sourceInput))zip.addLocalFile(sourceInput,'assets')
const startupInput=join(root,'artifacts/0.2.0/startup-playback-input.json');if(existsSync(startupInput))zip.addLocalFile(startupInput,'assets')
const backupInput=join(root,'artifacts/0.2.0/startup-backup-input.json');if(existsSync(backupInput))zip.addLocalFile(backupInput,'assets')
zip.writeZip(apk)
const aligned = join(out,'checks-aligned.apk'), output = join(root,`artifacts/0.2.0/freetv-player-${overlay?'overlay-':''}checks.apk`)
run(join(plugins,'app-safe-pack/zipalign/zipalign.exe'),['-f','4',apk,aligned])
run(java,['-jar',join(plugins,'app-safe-pack/apksigner.jar'),'sign','--ks',signing.certfile,'--ks-key-alias',signing.certalias,'--ks-pass','pass:'+signing.storepassword,'--key-pass','pass:'+signing.certpassword,'--out',output,aligned])
console.log(`Local-only ${overlay?'source overlay':'installed release'} native test APK: `+output)
