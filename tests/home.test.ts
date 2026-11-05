import test from 'node:test'
import assert from 'node:assert/strict'
import {homeCategoryIds,homeCacheKey,HOME_CATEGORIES} from '../src/domain/home'
import {readSearchQuery,searchUrl} from '../src/domain/search-query'
import {parseCategories} from '../src/domain/maccms'
import {MacCMSSource} from '../src/services/catalog-source'
import {BUILTIN_SOURCES} from '../src/domain/sources'

test('Search navigation preserves Chinese, emoji and literal percent text on both runtimes',()=>{
  for(const keyword of ['现在就出发 第四季','100%25 & = + # ?','😺 %E5%中文','不完整%转义']){
    const encoded=searchUrl(keyword).split('?q=')[1]
    assert.equal(readSearchQuery({q:encoded}),keyword)
    assert.equal(readSearchQuery({q:decodeURIComponent(encoded)}),keyword)
  }
  assert.equal(readSearchQuery({q:'%broken'}),'')
  assert.equal(readSearchQuery({keyword:encodeURIComponent('测试综艺')}),'测试综艺')
  assert.equal(readSearchQuery({keyword:'100%'}),'100%')
})
const taxonomy=[{type_id:1,type_name:'电影片'},{type_id:6,type_pid:1,type_name:'动作片'},{type_id:7,type_pid:1,type_name:'喜剧片'},{type_id:2,type_name:'连续剧'},{type_id:13,type_pid:2,type_name:'国产剧'},{type_id:3,type_name:'综艺片'},{type_id:25,type_pid:3,type_name:'大陆综艺'},{type_id:4,type_name:'动漫片'},{type_id:29,type_pid:4,type_name:'国产动漫'},{type_id:36,type_name:'短剧'},{type_id:38,type_pid:36,type_name:'女恋总裁'},{type_id:46,type_name:'体育'}]
test('Home exposes eight categories and inherits unnamed genre kinds without including sports',()=>{
  const rows=parseCategories(taxonomy)
  assert.deepEqual(HOME_CATEGORIES.map(x=>x.name),['全部','电影','国产剧','海外剧','国产综艺','海外综艺','国漫','海外动漫'])
  assert.deepEqual(homeCategoryIds(rows,'movie'),['1','6','7'])
  assert.deepEqual(homeCategoryIds(rows,'series'),['2','13','36','38'])
  assert.deepEqual(homeCategoryIds(rows,'variety'),['3','25'])
  assert.deepEqual(homeCategoryIds(rows,'anime'),['4','29'])
  assert.notEqual(homeCacheKey('a','movie',1,2026),homeCacheKey('a','movie',1,2027))
})
test('Recent home keeps parent and child items, rejects newly backfilled old films, and paginates without duplicates',async()=>{
  const urls:string[]=[];let active=0,peak=0
  const rows=[...Array.from({length:25},(_,i)=>({vod_id:i+1,vod_name:`新作${i}`,vod_year:i%2?'2025':'2026',vod_time:100-i,type_id:6,type_name:'动作片'})),{vod_id:99,vod_name:'补库旧片',vod_year:'1987',vod_time:200,type_id:6,type_name:'动作片'}]
  const adapter=new MacCMSSource(BUILTIN_SOURCES[0],async(url)=>{
    urls.push(url);active++;peak=Math.max(peak,active);await Promise.resolve()
    try{
      const q=new URL(url).searchParams,page=Number(q.get('pg')||1)
      const all=q.get('t')==='6'?rows:q.get('t')==='1'?[rows[0]]:[] // duplicate in parent
      return {status:200,headers:{},text:JSON.stringify(q.get('ac')==='list'?{list:[],class:taxonomy}:{code:1,page,pagecount:Math.ceil(all.length/20),total:all.length,list:all.slice((page-1)*20,page*20)})}
    }finally{active--}
  })
  const a=await adapter.home('movie',{year:2026}),b=await adapter.home('movie',{page:2,year:2026})
  assert.equal(a.items.length,20);assert.equal(b.items.length,5);assert.equal(b.next,null)
  assert.equal(new Set([...a.items,...b.items].map(x=>x.id)).size,25)
  assert.ok([...a.items,...b.items].every(x=>Number(x.year)>=2025))
  for(const url of urls.filter(x=>new URL(x).searchParams.get('ac')==='detail'))assert.equal(new URL(url).searchParams.get('year'),'2025-2026')
  assert.ok(peak<=3)
  assert.deepEqual((await adapter.home('variety-domestic',{year:2026})).items,[])
})

test('An API ignoring the year range has bounded work and a resumable cursor instead of admitting old films',async()=>{
  let calls=0
  const adapter=new MacCMSSource(BUILTIN_SOURCES[0],async(url)=>{
    const q=new URL(url).searchParams,page=Number(q.get('pg')||1)
    if(q.get('ac')==='list')return {status:200,headers:{},text:JSON.stringify({list:[],class:[taxonomy[1]]})}
    calls++
    return {status:200,headers:{},text:JSON.stringify({code:1,page,pagecount:18,total:18,list:[{vod_id:page,vod_name:`电影${page}`,vod_year:page===18?'2026':'1987',type_name:'动作片',type_id:6}]})}
  })
  const first=await adapter.home('movie',{year:2026})
  assert.equal(first.items.length,0);assert.equal(first.next,2);assert.ok(calls<=17)
  const second=await adapter.home('movie',{year:2026,page:2})
  assert.equal(second.items[0].id,'18');assert.equal(second.next,null)
})
