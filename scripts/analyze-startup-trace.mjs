import {readFileSync,writeFileSync,existsSync} from 'node:fs'
import {resolve} from 'node:path'

// ART/Traceview version 3, dual wall/thread-CPU clocks. Sampling spans are
// approximate; inclusive spans overlap and must not be added across threads.
const file=resolve(process.argv[2]||'artifacts/0.2.0/startup-method-release.trace')
const data=readFileSync(file),marker=Buffer.from('*end\n'),binary=data.indexOf(marker)+marker.length
if(binary<marker.length||data.toString('ascii',binary,binary+4)!=='SLOW')throw Error('Missing ART trace header')
const header=data.toString('utf8',0,binary),threads=new Map(),methods=new Map()
let section=''
for(const line of header.split('\n')){
  if(line.startsWith('*')){section=line;continue}
  const fields=line.split('\t')
  if(section==='*threads'&&fields.length>=2)threads.set(Number(fields[0]),fields[1])
  if(section==='*methods'&&fields.length>=3)methods.set(Number.parseInt(fields[0],16),{owner:fields[1],name:fields[2],signature:fields[3]})
}
const version=data.readUInt16LE(binary+4),offset=data.readUInt16LE(binary+6),size=data.readUInt16LE(binary+16)
if(version!==3||size!==14||!header.includes('clock=dual'))throw Error('Expected version 3 dual-clock trace')
const stacks=new Map(),spans=[],exclusive=[],lastTimes=new Map()
const unknownMethods=new Set()
let totalRecords=0,lastWall=0,mismatches=0
for(let position=binary+offset;position+size<=data.length;position+=size){
  const tid=data.readUInt16LE(position),packed=data.readUInt32LE(position+2),id=(packed&0xfffffffc)>>>0,action=packed&3
  const cpu=data.readUInt32LE(position+6),wall=data.readUInt32LE(position+10)
  if(!methods.has(id)){unknownMethods.add(id);methods.set(id,{owner:'Unlisted ART method',name:'0x'+id.toString(16)})}
  const stack=stacks.get(tid)||[];stacks.set(tid,stack)
  const previous=lastTimes.get(tid)
  if(previous&&wall>previous.wall&&stack.length){exclusive.push({tid,start:previous.wall,end:wall,cpu:Math.max(0,cpu-previous.cpu),method:stack.at(-1).id,ancestors:stack.map(frame=>frame.id)})}
  lastTimes.set(tid,{wall,cpu});lastWall=Math.max(lastWall,wall);totalRecords++
  if(action===0)stack.push({id,wall,cpu})
  else if(action===1||action===2){
    const index=stack.findLastIndex(frame=>frame.id===id)
    if(index<0){mismatches++;continue}
    while(stack.length>index){const frame=stack.pop();spans.push({tid,id:frame.id,start:frame.wall,end:wall,cpuMs:(cpu-frame.cpu)/1000,incomplete:false})}
  }
}
for(const [tid,stack] of stacks)for(const frame of stack)spans.push({tid,id:frame.id,start:frame.wall,end:lastTimes.get(tid).wall,cpuMs:(lastTimes.get(tid).cpu-frame.cpu)/1000,incomplete:true})
const label=id=>{const method=methods.get(id);return method.owner+'.'+method.name}
const main=[...threads].find(([,name])=>name==='main')?.[0]
const start=spans.filter(span=>label(span.id)==='android.app.Instrumentation.startActivitySync').sort((a,b)=>a.start-b.start)[0]?.start||0
const logFile=file.replace(/\.trace$/,'.log')
const reportLine=existsSync(logFile)?readFileSync(logFile,'utf8').split(/\r?\n/).find(line=>line.startsWith('SOURCE_REPORT ')):undefined
const sample=reportLine?JSON.parse(reportLine.slice(14)).results[0]:undefined
const stop=sample?.openToFirstFrameMs?start+sample.openToFirstFrameMs*1000:lastWall
const short=span=>({thread:threads.get(span.tid)||span.tid,method:label(span.id),startMs:Math.round((span.start-start)/100)/10,endMs:Math.round((span.end-start)/100)/10,wallMs:Math.round((span.end-span.start)/100)/10,cpuMs:Math.round(span.cpuMs*10)/10,incomplete:span.incomplete})
const totals=new Map()
for(const item of exclusive.filter(item=>item.tid===main&&item.end>start&&item.start<stop)){
  const names=item.ancestors.map(label)
  const category=names.some(name=>name.includes('PlaceholderSurface'))?'GSY placeholder surface':
    names.some(name=>/HardwareRenderer|ThreadedRenderer|ViewRootImpl.*(performTraversals|performDraw|draw|relayout)/.test(name))?'Window and rendering':
    names.some(name=>/PlayerCache\.get|SimpleCache\.<init>/.test(name))?'Media cache initialization':
    names.some(name=>/initVideoPlayer|IjkExo2MediaPlayer.prepareAsyncInternal/.test(name))?'Other player initialization':
    names.some(name=>/FreeTVPlayerActivity\.(onCreate|create|open)|ScopedVideo\.<init>/.test(name))?'Activity and GSY view construction':
    names.at(-1)?.includes('MessageQueue.nativePollOnce')?'Main queue idle / async wait':'Other main-thread work'
  const value=totals.get(category)||{wallMs:0,cpuMs:0};const wall=Math.min(item.end,stop)-Math.max(item.start,start);value.wallMs+=wall/1000;value.cpuMs+=item.cpu*wall/(item.end-item.start)/1000;totals.set(category,value)
}
const mainTop=spans.filter(span=>span.tid===main&&span.end>=start).sort((a,b)=>(b.end-b.start)-(a.end-a.start)).slice(0,45).map(short)
const selected=spans.filter(span=>span.end>=start&&/FreeTVPlayerActivity\.(onCreate|create|open)|ScopedVideo\.<init>|FreeTVEngine\.initVideoPlayer$|Exo2PlayerManager\.initVideoPlayer$|PlaceholderSurfaceThread\.init$|PlayerCache\.get$|HardwareRenderer\.(nSetStopped|nSyncAndDrawFrame)$|DefaultHttpDataSource\.(open|makeConnection)$|MediaCodecRenderer\.initCodec$|ExoPlayerImpl\.<init>|IjkExo2MediaPlayer\.prepareAsyncInternal|Instrumentation\.startActivitySync/.test(label(span.id))).sort((a,b)=>a.start-b.start).map(short)
const report={file,sample,format:{version,recordSize:size,totalRecords,mismatches,unknownMethods:[...unknownMethods].map(id=>'0x'+id.toString(16)),overflow:header.includes('data-file-overflow=true')},traceDurationMs:lastWall/1000,startOffsetMs:start/1000,firstFrameBoundaryMs:(stop-start)/1000,mainExclusive:[...totals].map(([category,value])=>({category,wallMs:Math.round(value.wallMs),cpuMs:Math.round(value.cpuMs)})).sort((a,b)=>b.wallMs-a.wallMs),selected,mainTop}
writeFileSync(file+'.json',JSON.stringify(report,null,2))
console.log(JSON.stringify({format:report.format,traceDurationMs:report.traceDurationMs,mainExclusive:report.mainExclusive,selected:report.selected},null,2))
