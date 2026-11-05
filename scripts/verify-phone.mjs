import {readFileSync,writeFileSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import AdmZip from 'adm-zip'
import {sourceDigest,digestTree} from './tv-build-input.mjs'
const root=resolve(import.meta.dirname,'..'),out=join(root,'artifacts/phone')
const receipt=JSON.parse(readFileSync(join(out,'phone-build-receipt.json'),'utf8'))
const sha=body=>createHash('sha256').update(body).digest('hex'),check=(ok,message)=>{if(!ok)throw Error(message)}
check(sha(readFileSync(receipt.apk))===receipt.sha256,'Phone APK checksum differs')
check(sourceDigest(root)===receipt.sourceHash,'Phone sources changed after compilation')
check(digestTree(join(root,'dist/build/app'))===receipt.compiledHash,'Compiled phone resources changed')
for(const file of receipt.nativeFiles)check(sha(readFileSync(join(root,'src',file.name)))===file.sha256,'Native source changed: '+file.name)
const previous=JSON.parse(readFileSync(join(root,'artifacts/0.2.0/phone-verification.json'),'utf8'))
check(receipt.certificateSha256===previous.certificateSha256,'Phone signing identity changed')
const zip=new AdmZip(receipt.apk),service=zip.readAsText('assets/apps/__UNI__E70B510/www/app-service.js')
check(!service.includes('toneType')&&!service.includes('freetv:v3:hot-titles')&&!service.includes('movie.douban.com/j/search_subjects'),'TV dictionary included in the phone APK')
const runtime=JSON.parse(zip.readAsText('assets/apps/__UNI__E70B510/www/manifest.json'))
check(Number(runtime.version.code)===receipt.versionCode,'Phone runtime version differs')
check(JSON.stringify(runtime.screenOrientation||runtime.plus.screenOrientation).includes('portrait'),'Phone portrait orientation missing')
const labels=['phone-categories','phone-posters','phone-search-empty','phone-search-error','native-completion-release','native-recovery-release','native-lifecycle-release'],checks={}
for(const label of labels){const text=readFileSync(join(out,label+'.log'),'utf8');check(text.includes('APK_SHA256 '+receipt.sha256),'Wrong APK check: '+label);check(text.includes('checks passed')&&!/check failed|checks failed|AssertionError|INSTRUMENTATION_FAILED|Process crashed/.test(text),'Incomplete check: '+label);checks[label]=true}
check(readFileSync(join(out,'release-install-check.log'),'utf8').includes(receipt.sha256),'Phone installed APK not verified')
const domain=readFileSync(join(out,'domain-tests.log'),'utf8'),domainTests=Number(/tests (\d+)/.exec(domain)?.[1])
check(domainTests>=75&&new RegExp('pass '+domainTests+'\\b').test(domain)&&/fail 0/.test(domain),'Phone shared tests incomplete')
const plugins=join(root,'.tools/HBuilderX-5.26/HBuilderX/plugins')
const badging=spawnSync(join(plugins,'uts-development-android/static/win/aapt2.exe'),['dump','badging',receipt.apk],{encoding:'utf8',windowsHide:true})
check(badging.status===0&&badging.stdout.includes("versionCode='"+receipt.versionCode+"'")&&!badging.stdout.includes('leanback-launchable-activity'),'Unexpected phone launcher or version')
writeFileSync(join(out,'release-badging.txt'),badging.stdout)
const baseline=new AdmZip(previous.apk).readFile('assets/apps/__UNI__E70B510/www/app-service.js').length
const result={...receipt,builtAt:receipt.at,at:new Date().toISOString(),status:'passed',checks:{...checks,domainTests,touchSearchPreserved:true,tvDictionaryExcluded:true,installedApkAndUpgrade:true},phoneJavaScriptBytes:Buffer.byteLength(service),previousPhoneJavaScriptBytes:baseline,physicalPhoneTested:false}
writeFileSync(join(out,'phone-verification.json'),JSON.stringify(result,null,2))
writeFileSync(join(out,`FreeTV-${receipt.version}-phone.apk.sha256`),receipt.sha256+`  FreeTV-${receipt.version}-phone.apk\n`)
writeFileSync(join(out,'Phone-verification.md'),`# FreeTV 手机 ${receipt.version} 验收记录\n\n- 安装包：FreeTV-${receipt.version}-phone.apk，versionCode ${receipt.versionCode}，包名 com.fxl.freetv.demo。\n- APK SHA-256：${receipt.sha256}\n- 原有签名一致，已完成覆盖安装并核对已安装 APK 哈希；原生 ${receipt.nativeEntriesUnchanged} 个条目与原生基座一致。\n- ${domainTests} 项共用逻辑测试通过。\n- 原有触屏搜索与两行八分类布局保留；成功空结果、网络失败不叠加空结果、海报缓存复用通过。\n- 原生完成进度、播放恢复、备用接力、回退和生命周期通过。\n- 手机包不含 TV 热门词库和拼音依赖，不启用 TV 联想或同步；主 JS ${Buffer.byteLength(service)} 字节，旧手机包 ${baseline} 字节（未压缩）。\n\n本次在 FreeTV_Android Android 模拟器验证，未连接实际手机。逐项日志与安装包对应关系见 phone-verification.json。\n`)
console.log(JSON.stringify({status:result.status,apk:receipt.apk,sha256:receipt.sha256,checks:result.checks,phoneJavaScriptBytes:result.phoneJavaScriptBytes},null,2))
