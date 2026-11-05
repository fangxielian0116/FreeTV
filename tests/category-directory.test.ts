import test from 'node:test'
import assert from 'node:assert/strict'
import {MacCMSSource} from '../src/services/catalog-source'
import {BUILTIN_SOURCES} from '../src/domain/sources'

const taxonomy=[{type_id:3,type_pid:0,type_name:'综艺片'},{type_id:25,type_pid:3,type_name:'大陆综艺'},{type_id:26,type_pid:3,type_name:'港台综艺'},{type_id:27,type_pid:26,type_name:'地方综艺'}]
const row=(id:number,category:number,time:number)=>({vod_id:id,vod_name:`节目${id}`,type_id:category,type_name:category===3?'综艺片':category===25?'大陆综艺':'港台综艺',vod_time:time})
function fixture(rows:Record<string,ReturnType<typeof row>[]>,options:{cancel?:()=>AbortSignal|undefined}={}){
  const urls:string[]=[];let active=0,peak=0
  const adapter=new MacCMSSource(BUILTIN_SOURCES[0],async(url,{signal}={})=>{
    urls.push(url);active++;peak=Math.max(peak,active)
    try{
      const query=new URL(url).searchParams
      await Promise.resolve()
      if(signal && options.cancel?.()===signal)throw new Error('cancelled')
      const category=query.get('t')||'',page=Number(query.get('pg')||1)
      const values=rows[category]||[],list=values.slice((page-1)*20,page*20)
      return {status:200,headers:{},text:JSON.stringify(query.get('ac')==='list'?{list:[],class:taxonomy}:{code:1,list,total:values.length,page,pagecount:Math.ceil(values.length/20)})}
    }finally{active--}
  })
  return {adapter,urls,peak:()=>peak}
}

test('Parent categories include direct items and all descendants, sorted and paginated without dropping a child category',async()=>{
  const rows={'3':[row(1,3,10)],'25':Array.from({length:30},(_,i)=>row(100+i,25,100-i*2)),'26':[row(2,26,99),row(3,26,85)],'27':[row(4,27,97)]}
  const f=fixture(rows),first=await f.adapter.list({category:'3'}),second=await f.adapter.list({category:'3',page:2})
  const expected=Object.values(rows).flat().sort((a,b)=>b.vod_time-a.vod_time).map(x=>String(x.vod_id))
  assert.equal(first.items.length,20);assert.equal(first.next,2);assert.equal(second.next,null)
  assert.deepEqual([...first.items,...second.items].map(x=>x.id),expected)
  assert.equal(first.total,34);assert.ok(f.peak()<=3)
  assert.equal(f.urls.filter(url=>new URL(url).searchParams.get('ac')==='list').length,1)
})

test('An API that already includes child categories retains its own single-request pagination',async()=>{
  const f=fixture({'3':Array.from({length:30},(_,i)=>row(i,25,100-i))})
  assert.equal((await f.adapter.list({category:'3'})).items.length,20)
  assert.equal((await f.adapter.list({category:'3',page:2})).items.length,10)
  assert.deepEqual(f.urls.filter(url=>new URL(url).searchParams.has('t')).map(url=>new URL(url).searchParams.get('t')),['3','3'])
})

test('Leaf categories query their own ID and are not replaced by an unfiltered directory',async()=>{
  const f=fixture({'25':[row(7,25,10)]})
  const page=await f.adapter.list({category:'25'})
  assert.deepEqual(page.items.map(x=>x.id),['7']);assert.equal(new URL(f.urls.at(-1)!).searchParams.get('t'),'25')
})

test('A cancelled load-more request does not consume or skip queued category entries',async()=>{
  let cancelled:AbortSignal|undefined
  const f=fixture({'25':Array.from({length:40},(_,i)=>row(100+i,25,100-i))},{cancel:()=>cancelled})
  const first=await f.adapter.list({category:'3'}),controller=new AbortController();cancelled=controller.signal
  await assert.rejects(f.adapter.list({category:'3',page:2,signal:controller.signal}),/cancelled/)
  cancelled=undefined
  const second=await f.adapter.list({category:'3',page:2})
  assert.equal(new Set([...first.items,...second.items].map(x=>x.id)).size,40);assert.equal(second.items[0].id,'120')
})
