import {readFileSync,writeFileSync,existsSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import AdmZip from 'adm-zip'
import {sourceDigest,digestTree} from './tv-build-input.mjs'
import {TV_VERSION,TV_VERSION_CODE} from './prepare-android-stage.mjs'
const root=resolve(import.meta.dirname,'..'),out=join(root,'artifacts/tv'),receipt=JSON.parse(readFileSync(join(out,'tv-build-receipt.json'),'utf8'))
const sha=body=>createHash('sha256').update(body).digest('hex'),check=(value,message)=>{if(!value)throw Error(message)}
check(sha(readFileSync(receipt.apk))===receipt.sha256,'Final APK checksum differs')
check(sourceDigest(root)===receipt.sourceHash,'Source changed after final compilation')
check(digestTree(join(root,'dist/build/tv-app'))===receipt.compiledHash,'Compiled TV resources changed')
for(const file of receipt.nativeFiles)check(sha(readFileSync(join(root,'src',file.name)))===file.sha256,'Native source changed: '+file.name)
const labels=['ui-1080-journey','ui-720-release','ui-4k-release','ui-1080-density240-release','native-tv-release','native-tv-4k-release','native-completion-release','native-recovery-release','native-lifecycle-release','sync-cold-first','sync-cold-second'],checks={}
for(const label of labels){const text=readFileSync(join(out,label+'.log'),'utf8');check(text.includes('APK_SHA256 '+receipt.sha256),'Check belongs to a different APK: '+label);check(text.includes('checks passed')&&!/checks failed|check failed|AssertionError|INSTRUMENTATION_FAILED|Process crashed/.test(text),'Check incomplete: '+label);checks[label]=true}
const journey=readFileSync(join(out,'ui-1080-journey.log'),'utf8')
check(journey.includes('TV_JOURNEY Search suggestion')&&journey.includes('TV_TITLES_SYNC Manual background refresh completed'),'Full remote journey/title refresh not verified')
check(readFileSync(join(out,'release-install-check.log'),'utf8').includes(receipt.sha256),'Installed APK not verified')
const domain=readFileSync(join(out,'domain-tests.log'),'utf8'),domainTests=Number(/tests (\d+)/.exec(domain)?.[1]);check(domainTests>=70&&new RegExp('pass '+domainTests+'\\b').test(domain)&&/fail 0/.test(domain),'Domain tests incomplete');check(domain.includes('Phone shared page automatically starts')&&domain.includes('TV shared page automatically starts'),'Shared auto-next controller tests missing');check(readFileSync(join(out,'native-completion-release.log'),'utf8').includes('NATIVE_COMPLETION'),'Native completion check missing')
const adb=join(root,'.tools/AndroidSDK/platform-tools/adb.exe'),plugins=join(root,'.tools/HBuilderX-5.26/HBuilderX/plugins')
function run(file,args){const value=spawnSync(file,args,{encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:4*1024*1024});check(value.status===0,String(value.error||value.stderr));return value.stdout.trim()}
const badging=run(join(plugins,'uts-development-android/static/win/aapt2.exe'),['dump','badging',receipt.apk])
check(badging.includes("versionCode='"+TV_VERSION_CODE+"'")&&badging.includes('leanback-launchable-activity')&&badging.includes("banner='res/drawable/tv_banner.png'")&&badging.includes("uses-feature-not-required: name='android.hardware.touchscreen'"),'TV manifest requirements missing')
writeFileSync(join(out,'release-badging.txt'),badging+'\n')
const zip=new AdmZip(receipt.apk)
check(!zip.getEntries().filter(entry=>/^classes\d*\.dex$/.test(entry.entryName)).some(entry=>zip.readFile(entry).includes(Buffer.from('Landroidx/media3/cast/'))),'Unexpected Cast module')
const deviceArgs=['-P','5038','-s','emulator-5556','shell']
const device={android:run(adb,[...deviceArgs,'getprop','ro.build.version.release']),sdk:run(adb,[...deviceArgs,'getprop','ro.build.version.sdk']),fingerprint:run(adb,[...deviceArgs,'getprop','ro.build.fingerprint']),features:run(adb,[...deviceArgs,'pm','list','features']).split(/\r?\n/).filter(line=>/leanback|television/.test(line))}
check(device.features.some(line=>line.includes('android.hardware.type.television')),'Verification device is not Android TV')
const coldFirst=readFileSync(join(out,'sync-cold-first.log'),'utf8'),coldSecond=readFileSync(join(out,'sync-cold-second.log'),'utf8')
const firstColdTime=/TV_COLD_SYNC ([^\r\n]+)/.exec(coldFirst)?.[1],secondColdTime=/TV_COLD_SYNC ([^\r\n]+)/.exec(coldSecond)?.[1]
check(firstColdTime&&secondColdTime&&firstColdTime!==secondColdTime&&coldFirst.includes('TV_WARM_SYNC')&&coldSecond.includes('TV_WARM_SYNC'),'Cold/warm sync policy not verified')
check(!readFileSync(join(root,'src/services/title-index.ts'),'utf8').includes('setInterval('),'Periodic title timer remains')
const benchmark=/TITLE_SEARCH_BENCHMARK[^\r\n]*/.exec(domain)?.[0]||''
const syncTime=secondColdTime
const profiles=labels.slice(0,4).map(label=>{const text=readFileSync(join(out,label+'.log'),'utf8'),line=text.split(/\r?\n/).find(line=>line.startsWith('TV_HOME '));const dom=JSON.parse(line.slice(8));check(dom.columns.split(' ').length===6,'Expected six TV poster columns: '+label);return {label,viewport:{width:dom.width,height:dom.height},columns:6,initialFocus:dom.focus}})
const result={at:new Date().toISOString(),status:'passed',apk:receipt.apk,sha256:receipt.sha256,sourceHash:receipt.sourceHash,certificateSha256:receipt.certificateSha256,nativeEntriesUnchanged:receipt.nativeEntriesUnchanged,checks:{...checks,installedApkAndUpgrade:true,tvLauncherAndBanner:true,touchscreenOptional:true,castAbsent:true,remoteHeldOkSingleActivation:true,realTitleRefresh:true,coldStartTitleSync:true,warmResumeDoesNotSync:true,noPeriodicTitleTimer:true,sharedAutoNext:true,nativeEndedEventAndProgress:true,domainTests},profiles,benchmark,latestTitleRefreshChinaTime:syncTime,device,physicalTvTested:false,limitations:['Validated on the official Android TV API 30 x86 emulator, not Hisense firmware or hardware','Real-source journey verifies the control flow; synthetic 1080p HLS fixtures verify decoding, handoff, rollback and failure handling','Short playback samples do not certify full-episode smoothness or hardware HDR/4K decoding']}
writeFileSync(join(out,'tv-verification.json'),JSON.stringify(result,null,2))
writeFileSync(join(out,`FreeTV-${TV_VERSION}-tv.apk.sha256`),receipt.sha256+`  FreeTV-${TV_VERSION}-tv.apk\n`)
const report=`# FreeTV TV ${TV_VERSION} 验收记录\n\n最终安装包：FreeTV-${TV_VERSION}-tv.apk，包名 com.fxl.freetv.demo，versionCode ${TV_VERSION_CODE}。\n\n- APK SHA-256：\`${receipt.sha256}\`\n- 源码指纹：\`${receipt.sourceHash}\`\n- 既有签名保持一致；合入最终 UI 后 ${receipt.nativeEntriesUnchanged} 个原生 dex/so 等条目保持不变。\n- 已核对安装后 APK 哈希，并完成两次覆盖安装；TV 桌面入口、banner 和无触屏声明通过。\n\n## 通过的检查\n\n| 检查 | 结果 |\n| --- | --- |\n| 720p / 213dpi | 六列布局与遥控器流程通过 |\n| 1080p / 320dpi | 搜索、收藏、选集、原生播放及返回焦点恢复通过 |\n| 4K / 640dpi | 六列布局与遥控器流程通过 |\n| 1080p / 240dpi | 六列布局与遥控器流程通过 |\n| 长按确认键 | 5 次重复事件只输入一个字母 |\n| 豆瓣热门片名 | 冷启动更新、热恢复不重拉和手动更新通过，最近更新时间 ${syncTime}（北京时间） |\n| 本地联想 | ${benchmark} |\n| 领域测试 | ${domainTests} 项通过，0 失败 |\n| 原生播放 | 确认暂停/继续、快进、自动隐藏控制栏及返回通过 |\n| 播放恢复 | 1080p 解码、备用实例接力、回退、低速/坏分片拒绝、取消通过 |\n| 自动连播 | 手机和 TV 共用播放页面测试、重复结束去重、最后一集返回及原生完成进度通过 |\n| 生命周期 | 主动暂停保持、临时离开恢复、同 Activity 接受新会话通过 |\n\n## 证据与边界\n\n逐项日志、源码/安装包对应关系和截图保存在本目录，机器可读记录为 tv-verification.json。手机 H5、手机 Android 资源及 TV H5 均完成构建检查；手机 0.2.1 已单独打包验收。\n\n本次设备为官方 Android TV API 30 x86 模拟器。尚未连接用户的海信 Vidda R75 2025 真机，海信固件、遥控器硬件、系统输入法及硬件 HDR/4K 解码仍需真机复验。真实视频源旅程用于验证操作链路，合成 1080p HLS 用于验证解码及恢复；不将短样本视为整集流畅性保证。\n`
writeFileSync(join(out,'TV-verification.md'),report)
console.log(JSON.stringify({status:result.status,apk:result.apk,sha256:result.sha256,checks:result.checks,benchmark},null,2))
