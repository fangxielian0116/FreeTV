import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import {adjacentEpisode,EpisodeCompletion} from '../src/domain/episode-navigation'
import {directRoutes,type DramaDetail,type SourceDefinition} from '../src/domain/catalog'
import {playbackReward,StallTracker,type PlaybackEvent,type WatchProgress} from '../src/domain/playback'
import {playRequest} from '../src/services/player-request'
import type {PlayRequest} from '../src/platform/player'
import type {PlayQueue} from '../src/services/play-queue'

const source:SourceDefinition={id:'fixture',name:'Fixture',api:'http://127.0.0.1:8754/',aliases:[],prior:1,enabled:true}
function detail():DramaDetail {
  return {sourceId:source.id,id:'episodes',title:'Three episodes',aliases:[],poster:'',year:'2026',kind:'series',categories:[],remarks:'',updatedAt:'',cast:[],directors:[],synopsis:'',routes:['main','other'].map(routeId=>({id:routeId,name:routeId,episodes:[0,1,2].map(index=>({key:String(index+1),label:`第${index+1}集`,routeId,index,url:`http://127.0.0.1:8754/healthy-${index}/index.m3u8`}))}))}
}
test('Episode navigation stays on the current route and never wraps or restarts an unknown episode',()=>{
  const show=detail(),episodes=show.routes[0].episodes
  assert.equal(adjacentEpisode(show,episodes[0],1),episodes[1])
  assert.equal(adjacentEpisode(show,episodes[1],-1),episodes[0])
  assert.equal(adjacentEpisode(show,episodes[0],-1),undefined)
  assert.equal(adjacentEpisode(show,episodes[2],1),undefined)
  assert.equal(adjacentEpisode(show,{routeId:'main',key:'missing'},1),undefined)
  assert.equal(adjacentEpisode(show,{routeId:'missing',key:'1'},1),undefined)
})
test('Only a real completion of the active session can advance, once per session',()=>{
  const completion=new EpisodeCompletion()
  for(const state of ['loading','playing','paused','buffering','error'] as const)assert.equal(completion.take({sessionId:'one',state},'one'),false)
  assert.equal(completion.take({sessionId:'stale',state:'ended'},'one'),false)
  assert.equal(completion.take({sessionId:'one',state:'ended'},'one'),true)
  assert.equal(completion.take({sessionId:'one',state:'ended'},'one'),false)
  assert.equal(completion.take({sessionId:'two',state:'ended'},'two'),true)
})

// Execute the actual shared page controller, with native I/O and uni lifecycle mocked.
// No test hook or fixture endpoint is added to either release application.
function page(tv:boolean) {
  const show=detail(),opens:PlayRequest[]=[],saved:WatchProgress[]=[]
  let current:PlayQueue={source,detail:show,episode:show.routes[0].episodes[0],position:17},backs=0,closes=0
  const noop=()=>{},modules:Record<string,unknown>={
    '@/components/TVNavigation.vue':{},'@/platform/target':{TV_BUILD:tv},'@/platform/tv-page':{useTVPage:()=>({value:true})},
    '@/services/title-index':{setTitlePlayback:noop},vue:{ref:(value:unknown)=>({value})},'@dcloudio/uni-app':{onReady:noop,onUnload:noop,onLoad:noop},
    '@/domain/playback':{playbackReward,StallTracker},'@/domain/episode-navigation':{adjacentEpisode,EpisodeCompletion},
    '@/services/play-queue':{playQueue:{get:()=>current,set:(value:PlayQueue)=>{current=value}}},
    '@/platform/player':{player:{open:async(value:PlayRequest)=>{opens.push(value);return true},close:()=>{closes++},cancelProbe:noop}},
    '@/services/player-request':{playRequest:(...args:Parameters<typeof playRequest>)=>{const value=playRequest(...args);if(tv)value.uiMode='tv';return value}},
    '@/services/library':{library:{saveProgress:(value:WatchProgress)=>saved.push(value)},catalogCache:{}},
    '@/services/source-store':{sourceState:{online:true,mode:'fixed',currentId:source.id},sourceById:()=>source,selectSource:noop,observe:noop,candidates:()=>[],coolSource:noop},
    '@/services/catalog':{adapter:noop,loadDetail:noop},'@/services/recovery':{RecoveryCoordinator:class {cancel(){} }},
    '@/services/mappings':{mappings:{get:()=>[]}},'@/services/storage':{writeLocal:noop},'@/domain/catalog':{directRoutes},
    '@/domain/recovery-policy':{RECOVERY_VERIFY_MS:12000,RECOVERY_COMMIT_MS:5000},
  }
  const code=readFileSync(new URL('../src/pages/player/player.vue',import.meta.url),'utf8').match(/<script setup[^>]*>([\s\S]*?)<\/script>/)![1]
  const compiled=ts.transpileModule(code+'\nexport {start,onEvent};',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
  const exports:Record<string,unknown>={}
  vm.runInNewContext(compiled,{exports,require:(id:string)=>{if(!(id in modules))throw Error('Missing playback test dependency '+id);return modules[id]},uni:{navigateBack:()=>{backs++}},Date,console},{filename:'shared-player-controller.js'})
  return {start:exports.start as ()=>Promise<void>,event:exports.onEvent as (event:PlaybackEvent)=>void,opens,saved,queue:()=>current,backs:()=>backs,closes:()=>closes}
}
function event(request:PlayRequest,state:PlaybackEvent['state'],online=true):PlaybackEvent {
  return {sessionId:request.sessionId,state,position:45,duration:45,online,at:Date.now(),metrics:{effectiveSeconds:1,rebufferCount:0,rebufferMs:0,width:1920,height:1080,bufferedSeconds:0,droppedFrames:0}}
}
for(const tv of [false,true])test(`${tv?'TV':'Phone'} shared page automatically starts the next episode at zero, ignores duplicate completions and exits once after the finale`,async()=>{
  const controller=page(tv);await controller.start();const first=controller.opens[0]
  assert.equal(first.position,17)
  controller.event(event(first,'ended'));assert.equal(controller.opens.length,2)
  const second=controller.opens[1];assert.equal(second.episode.key,'2');assert.equal(second.position,0)
  assert.equal(controller.saved[0].episodeKey,'1');assert.equal(controller.saved[0].ended,true)
  controller.event(event(first,'ended'));assert.equal(controller.opens.length,2)
  for(const state of ['paused','buffering','playing'] as const)controller.event(event(second,state))
  assert.equal(controller.opens.length,2)
  // Completion is an engine event: a temporarily stale network flag must not suppress it.
  controller.event(event(second,'ended',false));assert.equal(controller.opens.length,3)
  const finale=controller.opens[2];assert.equal(finale.episode.key,'3');assert.equal(finale.position,0)
  controller.event(event(second,'ended'));assert.equal(controller.opens.length,3)
  controller.event(event(finale,'ended'));controller.event(event(finale,'ended'))
  assert.equal(controller.opens.length,3);assert.equal(controller.backs(),1);assert.equal(controller.closes(),1)
  assert.equal(controller.queue().episode.routeId,'main')
})
