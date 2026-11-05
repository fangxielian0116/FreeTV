import test from 'node:test'
import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { indexTitle, mergeTitles, parseTitleFeed, suggestTitles, TITLE_FEEDS, TITLE_TTL, type TitleSuggestion } from '../src/domain/title-index'
import { createTitleIndex, titleSyncState } from '../src/services/title-index'

const now=Date.UTC(2026,10,4),row=(id:string,title:string,rank=0):TitleSuggestion=>({id,title,type:'tv',rank,seenAt:now})
const response=(id:string,title:string)=>({status:200,text:JSON.stringify({subjects:[{id,title}]}),headers:{}})
test('Chinese, traditional text, initials, pinyin and polyphonic title contexts match locally',()=>{
  const rows=[row('1','狂飙'),row('2','長安十二時辰'),row('3','重庆森林'),row('4','长津湖')].map(indexTitle)
  for(const query of ['kb','KB','kuangb','狂','飙'])assert.equal(suggestTitles(rows,query)[0].id,'1')
  assert.equal(suggestTitles(rows,'长安')[0].id,'2')
  assert.equal(suggestTitles(rows,'cqsl')[0].id,'3')
  assert.equal(suggestTitles(rows,'cjh')[0].id,'4')
  assert.equal(suggestTitles(rows,'doesnotexist').length,0)
})
test('Feed validation rejects block pages and bad content, merging bounds age, duplicates and count',()=>{
  assert.throws(()=>parseTitleFeed('<html>blocked</html>','tv',now))
  assert.throws(()=>parseTitleFeed('{"subjects":[]}','tv',now))
  assert.throws(()=>parseTitleFeed('{"subjects":[{"id":"x","title":"bad"}]}','tv',now))
  assert.equal(parseTitleFeed(response('1','狂飙').text,'tv',now)[0].title,'狂飙')
  const merged=mergeTitles([{...row('0','过期'),seenAt:now-TITLE_TTL-1},row('1','狂飙')],[row('1','狂飙',3)],now)
  assert.equal(merged.length,1);assert.equal(merged[0].rank,0)
  const many=Array.from({length:10020},(_,i)=>row(String(i),'热剧'+i))
  assert.equal(mergeTitles([],many,now).length,10000)
})
test('A cold start updates once; warm resumes and elapsed time never start another cycle',async()=>{
  const disk=new Map<string,unknown>(),calls:string[]=[],delays:number[]=[];let clock=now,bad=false
  const service=createTitleIndex({read:key=>disk.get(key),write:(key,value)=>disk.set(key,value),now:()=>clock,
    wait:async ms=>{delays.push(ms);clock+=ms},request:async url=>{calls.push(url);if(bad)throw Error('offline');return response(String(TITLE_FEEDS.findIndex(f=>url.includes('tag='+encodeURIComponent(f.tag))&&url.includes('type='+f.type))+1),'狂飙')}})
  await service.resume();assert.equal(calls.length,TITLE_FEEDS.length)
  assert.equal(delays.filter(ms=>ms===2000).length,TITLE_FEEDS.length)
  assert.equal(service.suggestions('kb')[0].title,'狂飙')
  service.pause();clock+=7*86400000;await service.resume();await service.refresh();assert.equal(calls.length,TITLE_FEEDS.length)
  bad=true;await service.refresh(true);assert.equal(service.suggestions('kb')[0].title,'狂飙')
  const failedCalls=calls.length;service.pause();clock+=86400000;await service.resume();await service.refresh();assert.equal(calls.length,failedCalls)
  bad=false;await service.refresh(true);assert.ok(calls.length>failedCalls)
})
test('Interrupted synchronization resumes after the saved category; corrupt latest snapshot falls back',async()=>{
  const disk=new Map<string,unknown>();let clock=now,stop=true,calls=0
  const deps={read:(key:string)=>disk.get(key),write:(key:string,value:unknown)=>disk.set(key,value),now:()=>clock,
    request:async()=>response(String(++calls),'狂飙'),wait:async(ms:number)=>{clock+=ms;if(ms===2000&&stop)service.pause()}}
  const service=createTitleIndex(deps);await service.resume();assert.equal(calls,1)
  stop=false;await service.resume();assert.equal(calls,TITLE_FEEDS.length)
  assert.equal(titleSyncState.completed,0)
  const snapshots=[...disk.entries()].map(([key,value])=>({key,value:value as {body:string}})).sort((a,b)=>JSON.parse(b.value.body).generation-JSON.parse(a.value.body).generation)
  disk.set(snapshots[0].key,{body:'corrupt',hash:'invalid'})
  const recovered=createTitleIndex(deps);assert.ok(recovered.suggestions('kb').length)
})
test('A failed snapshot write never publishes uncommitted titles',async()=>{
  let fail=false
  const disk=new Map<string,unknown>(),service=createTitleIndex({read:key=>disk.get(key),write:(key,value)=>{if(fail)throw Error('disk full');disk.set(key,value)},now:()=>now,wait:async()=>{},request:async()=>{fail=true;return response('1','狂飙')}})
  await service.resume();assert.deepEqual(service.suggestions('kb'),[])
})
test('The next cold start refreshes popular feeds even after a failed secondary category',async()=>{
  const disk=new Map<string,unknown>();let clock=now;const urls:string[]=[]
  const deps={read:(key:string)=>disk.get(key),write:(key:string,value:unknown)=>disk.set(key,value),now:()=>clock,wait:async(ms:number)=>{clock+=ms},request:async(url:string)=>{urls.push(url);if(url.includes(encodeURIComponent('纪录片')))throw Error('category offline');return response('1','狂飙')}}
  const service=createTitleIndex(deps)
  await service.resume();const before=urls.length;await createTitleIndex(deps).resume()
  assert.ok(urls[before].includes('tag='+encodeURIComponent('热门')))
  assert.equal(service.suggestions('kb')[0].title,'狂飙')
})
test('A new process updates even a recent completed cache, while local suggestions are immediately available',async()=>{
  const disk=new Map<string,unknown>();let calls=0
  const deps={read:(key:string)=>disk.get(key),write:(key:string,value:unknown)=>disk.set(key,value),now:()=>now,wait:async()=>{},request:async()=>{calls++;return response('1','狂飙')}}
  await createTitleIndex(deps).resume();assert.equal(calls,TITLE_FEEDS.length)
  const next=createTitleIndex(deps);assert.equal(next.suggestions('kb')[0].title,'狂飙');assert.equal(calls,TITLE_FEEDS.length)
  await next.resume();assert.equal(calls,2*TITLE_FEEDS.length)
})
test('A rapid background/foreground transition resumes an aborted request without losing the pending cycle',async()=>{
  const disk=new Map<string,unknown>();let calls=0,release:()=>void=()=>{}
  const service=createTitleIndex({read:key=>disk.get(key),write:(key,value)=>disk.set(key,value),now:()=>now,wait:async()=>{},request:async()=>{calls++;if(calls===1)await new Promise<void>(resolve=>{release=resolve});return response('1','狂飙')}})
  const first=service.resume();service.pause();const returning=service.resume();release();await Promise.all([first,returning])
  assert.equal(calls,TITLE_FEEDS.length+1);assert.equal(titleSyncState.busy,false)
  assert.equal(service.suggestions('kb')[0].title,'狂飙')
})
test('Playback/background pause aborts a request and defers even a forced refresh until resume',async()=>{
  let requests=0;const disk=new Map<string,unknown>()
  const service=createTitleIndex({read:key=>disk.get(key),write:(key,value)=>disk.set(key,value),now:()=>now,wait:async()=>{},request:async()=>{requests++;service.pause();return response('1','狂飙')}})
  await service.refresh(true);assert.equal(requests,0)
  await service.resume();assert.equal(requests,1);assert.equal(service.suggestions('kb').length,0)
  await service.refresh(true);assert.equal(requests,1)
})
test('Ten thousand titles return at most eight suggestions within the 100ms budget',()=>{
  const rows=Array.from({length:10000},(_,i)=>indexTitle(row(String(i),'热门剧集'+i,i)))
  suggestTitles(rows,'rm')
  const times:number[]=[]
  for(const query of ['r','rm','rmjj','remen','热','热门剧集99']){const start=performance.now();assert.ok(suggestTitles(rows,query).length<=8);times.push(performance.now()-start)}
  assert.ok(Math.max(...times)<100,`Slowest search took ${Math.max(...times).toFixed(1)}ms`)
  console.log(`TITLE_SEARCH_BENCHMARK 10000 titles: max ${Math.max(...times).toFixed(1)}ms; six queries total ${times.reduce((a,b)=>a+b,0).toFixed(1)}ms`)
})
