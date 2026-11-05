import test from 'node:test'
import assert from 'node:assert/strict'
import { RecoveryCoordinator, type RecoveryDependencies } from '../src/services/recovery'
import { parseDetail } from '../src/domain/maccms'
import { BUILTIN_SOURCES } from '../src/domain/sources'
import type { DramaDetail, SourceAdapter } from '../src/domain/catalog'
function work(sourceId: string, labels = ['第01集', '第02集']): DramaDetail { return parseDetail(sourceId, { vod_id: 7, vod_name: '甲', vod_year: '2026', type_name: '国产剧', vod_actor: '张三,李四', vod_play_from: 'm3u8', vod_play_url: labels.map((label,i)=>`${label}$https://${sourceId}.example.com/${i}.m3u8`).join('#') }) }
function harness(candidate = work('qiyi')) {
  const original = work('xigua'), probes: string[] = [], discarded: string[] = []
  const adapter: SourceAdapter = { categories: async()=>[], list: async()=>({items:[],page:1,next:null,total:0}), search: async()=>({items:[candidate],page:1,next:null,total:1}), detail: async()=>candidate, resolve: (_d,e)=>({url:e.url,headers:{}}) }
  const deps: RecoveryDependencies = { adapter: ()=>adapter, candidates: excluded=>BUILTIN_SOURCES.filter(x=>x.id==='qiyi'&&!excluded.has(x.id)), known: ()=>undefined, cool: ()=>{}, discard:()=>discarded.push('discard'), probe:async(_s,_d,e)=>{probes.push(e.label);return {status:'ready',reason:'ok',elapsedMs:10,token:'ready'}} }
  return {original, candidate, probes, discarded, deps}
}
test('Exact episode recovery prepares but never commits global source state', async()=>{
  const h=harness(), coordinator=new RecoveryCoordinator(h.deps)
  const plan=await coordinator.prepare(h.original,h.original.routes[0].episodes[1],120,()=>true)
  assert.equal(plan?.match.level,'episode');assert.deepEqual(h.probes,['第02集'])
})
test('Work-only recovery probes a main episode and returns the details fallback',async()=>{
  const h=harness(work('qiyi',['未标注正片'])), coordinator=new RecoveryCoordinator(h.deps)
  const plan=await coordinator.prepare(h.original,h.original.routes[0].episodes[1],120,()=>true)
  assert.equal(plan?.match.level,'work');assert.deepEqual(h.probes,['未标注正片'])
})
test('Unknown probe results never produce a switch plan',async()=>{
  const h=harness();h.deps.probe=async()=>({status:'unknown',reason:'timeout',elapsedMs:6000})
  assert.equal(await new RecoveryCoordinator(h.deps).prepare(h.original,h.original.routes[0].episodes[0],0,()=>true),undefined)
})

test('A trustworthy candidate remains eligible after the six-second optimisation target',async()=>{
  const h=harness();let clock=0;h.deps.now=()=>clock
  h.deps.probe=async()=>{clock=8500;return {status:'ready',reason:'decoded frame and buffer ready',elapsedMs:8500,token:'ready'}}
  const plan=await new RecoveryCoordinator(h.deps).prepare(h.original,h.original.routes[0].episodes[0],30,()=>true)
  assert.equal(plan?.match.level,'episode');assert.equal(plan?.deadline,12000)
})
test('Metadata work cannot exceed the shared deadline or proceed to probing after cancellation',async()=>{
  const h=harness();let clock=0;h.deps.now=()=>clock;const old=h.deps.adapter;h.deps.adapter=s=>({...old(s),search:async()=>{clock=13000;return {items:[h.candidate],page:1,next:null,total:1}}})
  assert.equal(await new RecoveryCoordinator(h.deps).prepare(h.original,h.original.routes[0].episodes[0],0,()=>true),undefined);assert.equal(h.probes.length,0)
  const next=harness();const coordinator=new RecoveryCoordinator(next.deps);const job=coordinator.prepare(next.original,next.original.routes[0].episodes[0],0,()=>false);coordinator.cancel();assert.equal(await job,undefined)
})
test('Identical actual input URLs are skipped instead of pretending a mirror improves delivery',async()=>{
  const h=harness();h.candidate.routes[0].episodes[0].url=h.original.routes[0].episodes[0].url
  assert.equal(await new RecoveryCoordinator(h.deps).prepare(h.original,h.original.routes[0].episodes[0],0,()=>true),undefined);assert.equal(h.probes.length,0)
})

test('Explicit missing-episode feedback may use the confirmed-work fallback without relying on list length',async()=>{
  const h=harness(work('qiyi',['第01期上','第01期下']))
  const plan=await new RecoveryCoordinator(h.deps).prepare(h.original,h.original.routes[0].episodes[0],120,()=>true,true)
  assert.equal(plan?.match.level,'work');assert.equal(h.probes[0],'第01期下')
})
