import {readFileSync,readdirSync,writeFileSync,existsSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import AdmZip from 'adm-zip'

const root=resolve(import.meta.dirname,'..'),out=join(root,'artifacts/0.2.0'),receipt=JSON.parse(readFileSync(join(out,'apk-build-receipt.json'),'utf8'))
const startup=process.argv.includes('--startup')
const sha=body=>createHash('sha256').update(body).digest('hex')
function check(value,message){if(!value)throw new Error(message)}
const digest=createHash('sha256')
function sources(directory){for(const entry of readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const file=join(directory,entry.name);if(entry.isDirectory())sources(file);else digest.update(file.slice(root.length+1).replaceAll('\\','/')).update('\0').update(readFileSync(file)).update('\0')}}
sources(join(root,'src'))
for(const name of ['package.json','package-lock.json','vite.config.ts','tsconfig.json','index.html'])digest.update(name).update('\0').update(readFileSync(join(root,name))).update('\0')
check(digest.digest('hex')===receipt.sourceHash,'Application source changed after this APK was submitted')
for(const file of receipt.nativeFiles)check(sha(readFileSync(join(root,'src',file.name)))===file.sha256,'Native input differs: '+file.name)
check(sha(readFileSync(receipt.apk))===receipt.sha256,'APK hash does not match the build receipt')
const plugins=join(root,'.tools/HBuilderX-5.26/HBuilderX/plugins'),java=join(plugins,'amazon-corretto/bin/java.exe'),signer=join(plugins,'app-safe-pack/apksigner.jar')
function certificate(apk){const result=spawnSync(java,['-jar',signer,'verify','--print-certs',apk],{encoding:'utf8',windowsHide:true});check(result.status===0,'APK signature verification failed');return /certificate SHA-256 digest: ([a-f0-9]+)/i.exec(result.stdout)?.[1]}
const cert=certificate(receipt.apk),baseline=join(root,'dist/release/apk/__UNI__E70B510__20261103121024.apk')
check(cert&&existsSync(baseline)&&cert===certificate(baseline),'Signing identity does not match the previous installable APK')
const zip=new AdmZip(receipt.apk),entries=zip.getEntries()
check(!entries.filter(x=>/^classes\d*\.dex$/.test(x.entryName)).some(x=>zip.readFile(x).includes(Buffer.from('Landroidx/media3/cast/'))),'Unexpected Cast module in APK')
const app=entries.find(x=>/assets\/apps\/[^/]+\/www\/app-service\.js$/.test(x.entryName));check(app,'Missing compiled application')
const body=zip.readAsText(app)
check(/connectPlayerByJs/.test(body)&&/keepAlive:!0/.test(body),'Persistent native callback marker missing')
const log=readFileSync(join(out,startup?'startup-release-playback-check.log':'native-release-1080-check.log'),'utf8')
if(startup)check(log.includes('APK_SHA256 '+receipt.sha256),'Playback check belongs to a different APK')
check(log.includes('FreeTV native playback checks passed')&&!log.includes('check failed'),'Installed release playback checks have not passed')
check(log.includes('Playback command implementation: tv.danmaku.ijk.media.exo2.Exo2PlayerManager'),'Installed release is not verified against the official GSY adapter')
const lifecycle=readFileSync(join(out,startup?'startup-release-lifecycle-check.log':'player-fix-lifecycle-release-check.log'),'utf8')
if(startup)check(lifecycle.includes('APK_SHA256 '+receipt.sha256),'Lifecycle check belongs to a different APK')
check(lifecycle.includes('Existing activity accepted a fresh playback session')&&lifecycle.includes('FreeTV native playback checks passed')&&!lifecycle.includes('check failed'),'Installed release lifecycle/retry checks have not passed')
function sourceReport(name){const line=readFileSync(join(out,name),'utf8').split(/\r?\n/).find(x=>x.startsWith('SOURCE_REPORT '));check(line,'Missing source report: '+name);return JSON.parse(line.slice(14))}
const initial=sourceReport('source-android-overlay-check.log'),retry=sourceReport('feifan-android-release-check.log'),continuous=sourceReport('xigua-120s-android-release-check.log')
const sourceResults=initial.results.map(row=>({...row,testMode:'local source overlay'}))
for(const row of retry.results){const index=sourceResults.findIndex(x=>x.sourceId===row.sourceId);if(index>=0)sourceResults[index]={...row,testMode:'installed release',earlierAttempt:sourceResults[index]}}
const baselineSourceEvidence={scope:'Historical samples before the official-adapter refactor; these were not rerun against this APK',testedAt:initial.at,sourceSamplesPlayed:sourceResults.filter(x=>x.status==='sample-played').length,sourceResults,continuousReleaseSample:continuous.results}
writeFileSync(join(out,'source-android-check.json'),JSON.stringify({generatedAt:new Date().toISOString(),...baselineSourceEvidence},null,2))
const referenceLine=readFileSync(join(out,'nov01-upstream-reference-check.log'),'utf8').split(/\r?\n/).find(line=>line.startsWith('REFERENCE_RESULT '))
const reference=referenceLine?JSON.parse(referenceLine.slice('REFERENCE_RESULT '.length)):undefined
const currentEpisodeSample=sourceReport(startup?'startup-after-release-repeat.log':'nov01-player-fix-release-check.log')
const report={at:new Date().toISOString(),apk:receipt.apk,sha256:receipt.sha256,sourceHash:receipt.sourceHash,certificateSha256:cert,checks:{currentSourceMatchesApk:true,existingSignature:true,castAbsent:true,persistentCallback:true,officialGsyAdapter:true,installedReleasePlayback:true,installedReleaseLifecycleAndRetry:true},baselineSourceEvidence,sameEpisodeStockPlayerReference:reference,limitations:['Emulator only; no physical Android phone or TV validation','Source smoke tests cover selected samples, not whole episodes or catalogue completeness','The exact real episode also buffers frequently in the unmodified stock player; visual smoothness is not certified','A certificate-expiry failure was observed in an Android run of the exact episode; TLS checks remain enabled','Final emulator window capture timed out, so a full tap-through UI journey is not certified for this APK','TV adaptation is a subsequent stage']}
report.currentReleaseEpisodeSample=currentEpisodeSample
if(startup){
  const warmup=readFileSync(join(out,'startup-release-warmup-check.log'),'utf8')
  check(warmup.includes('APK_SHA256 '+receipt.sha256)&&warmup.includes('FreeTV startup warmup checks passed')&&!warmup.includes('check failed'),'Release warmup checks have not passed')
  const fixtureLog=readFileSync(join(out,'startup-release-redirect-check.log'),'utf8'),fixture=sourceReport('startup-release-redirect-check.log').results[0]
  check(fixtureLog.includes('APK_SHA256 '+receipt.sha256)&&fixture.status==='sample-played'&&fixture.metrics.startupManifests===2&&fixture.declaredOrientation===6&&fixture.fullscreenWindow,'Release redirect/relative-playlist reuse and manifest configuration not verified')
  const samples=currentEpisodeSample.results
  check(readFileSync(join(out,'startup-after-release-repeat.log'),'utf8').includes('APK_SHA256 '+receipt.sha256),'Episode samples belong to a different APK')
  check(samples.length===3&&samples.every(row=>row.status==='sample-played'&&row.openToRenderedFrameMs>0&&row.declaredOrientation===6&&row.fullscreenWindow),'Release episode timing samples are incomplete')
  const installed=readFileSync(join(out,'startup-release-install-check.log'),'utf8')
  check(installed.includes('INSTALLED_APK_SHA256 '+receipt.sha256),'Installed package differs from the generated artifact')
  const summary=rows=>{const values=rows.map(row=>row.openToRenderedFrameMs);return {firstMs:values[0],samplesMs:values,medianMs:[...values].sort((a,b)=>a-b)[1]}}
  const beforeControlled=sourceReport('startup-baseline-controlled-repeat.log').results,afterControlled=sourceReport('startup-release-controlled-repeat.log').results
  check(beforeControlled.length===3&&afterControlled.length===3&&[...beforeControlled,...afterControlled].every(row=>row.status==='sample-played'&&row.openToRenderedFrameMs>0),'Controlled startup comparison is incomplete')
  check(readFileSync(join(out,'startup-release-controlled-repeat.log'),'utf8').includes('APK_SHA256 '+receipt.sha256),'Controlled samples belong to a different APK')
  const baseline=summary(beforeControlled),controlledRelease=summary(afterControlled),release=summary(samples)
  report.startupOptimization={controlledComparison:{baseline,optimized:controlledRelease,medianReductionPercent:Math.round((1-controlledRelease.medianMs/baseline.medianMs)*1000)/10,firstLaunchReductionPercent:Math.round((1-controlledRelease.firstMs/baseline.firstMs)*1000)/10},realSourceRelease:release,realSourceBaselineAttempts:sourceReport('startup-baseline-unlocked-repeat.log').results,realSourceBaselineComparable:false,fixture,scope:'Controlled groups each contain three sequential launches of a local 1080p HLS fixture with a fixed two-second master-playlist delay. Real-source baseline included a certificate failure and is not used for percentage claims. All runs use the emulator after application initialization; cache and host load can vary.'}
  Object.assign(report.checks,{installedApkHash:true,launchLandscapeAndFullscreen:true,warmupCancellationAndSessionIsolation:true,preparedRedirectedPlaylistsReused:true,releaseStartupSamples:true})
  report.limitations=['Emulator only; no physical phone or TV timing validation','The groups are small sequential samples with media cache and changing network/host conditions','First-render timestamp measures submission to video output, not external screen scanout','Short playback samples do not certify full-episode smoothness','The full frontend tap-through journey is not certified by these native instrumentation tests','TV adaptation is a subsequent stage']
}
if(process.argv.includes('--hardware')){
  check(startup,'Hardware evidence requires startup validation')
  const renderer=readFileSync(join(out,'startup-emulator-host-renderer.txt'),'utf8').trim()
  check(renderer.includes('NVIDIA')&&!renderer.includes('SwiftShader'),'Hardware renderer was not confirmed')
  const hostInstalled=readFileSync(join(out,'startup-hostgpu-install-check.log'),'utf8')
  check(hostInstalled.includes('INSTALLED_APK_SHA256 '+receipt.sha256),'Hardware test installed a different APK')
  const hostPlayback=readFileSync(join(out,'startup-hostgpu-playback-check.log'),'utf8')
  check(hostPlayback.includes('APK_SHA256 '+receipt.sha256)&&hostPlayback.includes('FreeTV native playback checks passed')&&!hostPlayback.includes('check failed'),'Hardware playback/recovery regression failed')
  const warm=sourceReport('startup-hostgpu-episode-check.log').results,cold=sourceReport('startup-hostgpu-cold-episode-check.log').results
  for(const name of ['startup-hostgpu-episode-check.log','startup-hostgpu-cold-episode-check.log'])check(readFileSync(join(out,name),'utf8').includes('APK_SHA256 '+receipt.sha256),'Hardware samples belong to a different APK')
  check(warm.length===3&&cold.length===3&&[...warm,...cold].every(row=>row.status==='sample-played'&&row.openToRenderedFrameMs>0&&row.declaredOrientation===6&&row.fullscreenWindow&&row.launchWarmupBeforeActivity&&row.metrics.width>=1920&&row.metrics.height>=1080),'Hardware first-frame/resolution samples incomplete')
  check(cold.every(row=>row.coldMediaCacheRequested&&row.removedEpisodeCacheEntries>0),'Cold media cache was not cleared for each attempt')
  const summary=rows=>{const values=rows.map(row=>row.openToRenderedFrameMs);return {firstMs:values[0],samplesMs:values,medianMs:[...values].sort((a,b)=>a-b)[1]}}
  report.hardwareRendererValidation={renderer,sameApkSha256:receipt.sha256,playbackHandoffAndRollbackPassed:true,warmMedia:summary(warm),coldMedia:summary(cold),warmSamples:warm,coldSamples:cold,scope:'Same optimized signed APK, after switching the emulator from SwiftShader to host NVIDIA rendering. Cold-media samples remove only this episode media cache before each attempt; application initialization is outside the timing. This renderer comparison must not be attributed solely to application changes.'}
  Object.assign(report.checks,{hostGpuPlaybackRecovery:true,hostGpuWarmStartupSamples:true,hostGpuColdMediaStartupSamples:true})
}
writeFileSync(join(out,'phone-verification.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
