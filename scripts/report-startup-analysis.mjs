import {readFileSync,writeFileSync} from 'node:fs'
const root='artifacts/0.2.0/'
const lines=readFileSync(root+'startup-readyapp-render-release.log','utf8').split(/\r?\n/)
const sample=JSON.parse(lines.find(line=>line.startsWith('SOURCE_REPORT ')).slice(14)).results[0]
const loads=lines.filter(line=>line.startsWith('STARTUP_LOAD ')).map(line=>JSON.parse(line.slice(13)))
const manifests=loads.filter(item=>item.event==='onLoadCompleted'&&item.type===4)
const master=manifests.find(item=>new URL(item.uri).pathname.endsWith('/index.m3u8'))
const media=manifests.find(item=>new URL(item.uri).pathname.endsWith('/mixed.m3u8'))
if(!master||!media||!sample.openToRenderedFrameMs)throw Error('Incomplete startup timing evidence')
const end=item=>item.loadEventTimeMs-sample.nativeOpenAtMs
const begin=item=>end(item)-item.loadMs
const trace=JSON.parse(readFileSync(root+'startup-method-release.trace.json','utf8'))
const localLine=readFileSync(root+'startup-local-fixture-release.log','utf8').split(/\r?\n/).find(line=>line.startsWith('SOURCE_REPORT '))
const local=JSON.parse(localLine.slice(14)).results[0]
const stages=[
  {stage:'Before first playlist request',startMs:0,endMs:begin(master)},
  {stage:'Master playlist request, including redirects',startMs:begin(master),endMs:end(master)},
  {stage:'Media playlist request',startMs:begin(media),endMs:end(media)},
  {stage:'Media reads, decoding and presentation, overlapping',startMs:end(media),endMs:sample.openToRenderedFrameMs}
].map(item=>({...item,elapsedMs:item.endMs-item.startMs}))
const report={at:new Date().toISOString(),scope:'Diagnosis of the existing signed player-fix APK on the emulator. No production application source or APK changes.',episode:'现在就出发第四季 / 20261101下',latestApplicationReadyRun:{...sample,stages},separateMethodSamplingRun:{firstFrameCallbackMs:trace.firstFrameBoundaryMs,format:trace.format,viewConstructionMs:83.7,officialManagerInitializationMs:311.1,placeholderSurfaceMs:267.2,placeholderIncludedInManager:true,coreConstructionMs:50.4,blockingDraw:{startMs:2443,endMs:4995.1,blockedNativeCallMs:2536.9},mainWindowRenderingMs:trace.mainExclusive.find(item=>item.category==='Window and rendering').wallMs},local1080pFixture:{nativeOpenToCallbackMs:local.openToFirstFrameMs,activityIdleWaitMs:local.activityStartMs,networkMultiple:local.metrics.networkMultiple},runtimeRenderer:readFileSync(root+'startup-emulator-renderer.txt','utf8').trim(),priorities:['Reduce redundant window/orientation/surface transitions before playback preparation','Start official player preparation earlier without replacing GSY playback controls or threads','Measure a hardware graphics emulator separately to distinguish application changes from SwiftShader overhead','Then optimize sequential playlist connections and media loading'],limits:['Native activity request to Media3 first-render timestamp; frontend click/navigation/UTS bridge latency is outside this measurement','The detailed method trace is a separate sampled run with cold application initialization; its timestamps must not be spliced into the latest run','Main-thread rendering time overlaps network and decoder work and cannot be added to those durations','Media data may be cached. Load duration is not equivalent to remote download time','Media3 first-render timestamp records frame submission to the video output, not an external measurement of screen scanout','The local fixture run was measured by callback time and included cold application startup','No physical phone timing or post-optimization speedup has been verified']}
writeFileSync(root+'startup-analysis.json',JSON.stringify(report,null,2))
console.log(JSON.stringify({latestActualFirstRenderMs:sample.openToRenderedFrameMs,callbackLagMs:sample.firstFrameCallbackLagMs,stages:report.latestApplicationReadyRun.stages,separateTraceMainRenderingMs:report.separateMethodSamplingRun.mainWindowRenderingMs,localFixtureCallbackMs:local.openToFirstFrameMs},null,2))
