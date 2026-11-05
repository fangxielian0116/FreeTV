import test from 'node:test'
import assert from 'node:assert/strict'
import {homeClassifier, savedHomeCategory} from '../src/domain/home'
import {productionRegion} from '../src/domain/production-region'
import {formatChinaDateTime,chinaYear} from '../src/domain/date-time'
import {parseCategories,parseItem,parsePayload} from '../src/domain/maccms'
import {MacCMSSource} from '../src/services/catalog-source'
import {BUILTIN_SOURCES} from '../src/domain/sources'

const taxonomy=[{type_id:1,type_name:'电影片'},{type_id:6,type_pid:1,type_name:'动作片'},{type_id:2,type_name:'连续剧'},{type_id:13,type_pid:2,type_name:'国产剧'},{type_id:14,type_pid:2,type_name:'香港剧'},{type_id:16,type_pid:2,type_name:'欧美剧'},{type_id:36,type_name:'短剧'},{type_id:38,type_pid:36,type_name:'现代言情'},{type_id:3,type_name:'综艺片'},{type_id:25,type_pid:3,type_name:'大陆综艺'},{type_id:28,type_pid:3,type_name:'欧美综艺'},{type_id:4,type_name:'动漫片'},{type_id:29,type_pid:4,type_name:'国产动漫'},{type_id:30,type_pid:4,type_name:'日韩动漫'},{type_id:46,type_name:'体育'}]
const row=(id:number,category:number,area='',year='2026')=>({vod_id:id,vod_name:`节目${id}`,type_id:category,type_name:taxonomy.find(x=>x.type_id===category)?.type_name||'',vod_area:area,vod_year:year,vod_time:10000-id})
function fixture(rows:ReturnType<typeof row>[],options:{cancel?:()=>AbortSignal|undefined}={}) {
  const urls:string[]=[];let active=0,peak=0
  const source=new MacCMSSource(BUILTIN_SOURCES[0],async(url,{signal}={})=>{
    urls.push(url);active++;peak=Math.max(peak,active);await Promise.resolve()
    try {
      if(signal&&signal===options.cancel?.())throw new Error('cancelled')
      const query=new URL(url).searchParams,page=Number(query.get('pg')||1),id=query.get('t')
      const selected=id?rows.filter(x=>String(x.type_id)===id):rows,items=selected.slice((page-1)*5,page*5)
      return {status:200,headers:{},text:JSON.stringify(query.get('ac')==='list'?{list:[],class:taxonomy}:{code:1,list:items,total:selected.length,page,pagecount:Math.ceil(selected.length/5)})}
    } finally {active--}
  })
  return {source,urls,peak:()=>peak}
}

test('Production area covers domestic aliases and co-productions without treating language as origin',()=>{
  for(const area of ['中国大陆','内地','中國香港','澳门','臺灣','Hong Kong','Taiwan','CN'])assert.equal(productionRegion([area]),'domestic',area)
  assert.equal(productionRegion(['日本','中国大陆']),'domestic')
  for(const area of ['日本','韩国','美国,德国','Singapore','新加坡','马来西亚'])assert.equal(productionRegion([area]),'overseas',area)
  for(const area of ['','未知','其它','普通话','粤语','华语','亚洲'])assert.equal(productionRegion([area]),'unknown',area)
})
test('JSON and XML preserve production metadata; classification also handles inherited subcategories',()=>{
  const item=parseItem('a',row(1,38,'中国大陆,中国香港'))
  assert.deepEqual(item.areas,['中国大陆','中国香港'])
  const xml=parsePayload('<rss><list><video><id>2</id><name>测试动画</name><type>动漫片</type><area>日本</area></video></list></rss>')
  const classifier=homeClassifier(parseCategories(taxonomy))
  assert.equal(classifier.kind(item),'series')
  assert.equal(classifier.region(item),'domestic')
  assert.equal(classifier.region(parseItem('a',xml.list[0])),'overseas')
  assert.equal(classifier.region(parseItem('a',row(3,14))),'domestic')
  assert.equal(classifier.region(parseItem('a',row(4,16))),'overseas')
  assert.equal(classifier.region(parseItem('a',row(5,2,'新加坡'))),'overseas')
  assert.equal(classifier.region(parseItem('a',row(6,2))),'unknown')
})
test('All reads a combined directory, keeps unknown regions and filters sports and old backfills',async()=>{
  const f=fixture([row(1,6),row(2,2),row(3,4),row(4,46),row(5,3),row(6,6,'美国','1987')])
  const page=await f.source.home('all',{year:2026})
  assert.deepEqual(page.items.map(x=>x.id),['1','2','3','5']);assert.equal(page.next,null)
  assert.ok(f.urls.every(url=>!new URL(url).searchParams.has('t')))
  assert.equal(f.urls.length,3) // taxonomy plus two combined pages, not all genre branches
})
test('Regional pagination stays disjoint, retains co-productions and survives a cancelled page',async()=>{
  let cancelled:AbortSignal|undefined
  const rows=[...Array.from({length:25},(_,i)=>row(i+1,13,'中国大陆')),...Array.from({length:25},(_,i)=>row(i+101,16,'美国')),row(201,14),row(202,2),row(203,30,'中国大陆,日本'),row(204,30,'日本'),row(205,29)]
  const f=fixture(rows,{cancel:()=>cancelled})
  const domestic=await f.source.home('series-domestic',{year:2026})
  assert.equal(domestic.items.length,20)
  const controller=new AbortController();cancelled=controller.signal
  await assert.rejects(f.source.home('series-domestic',{page:2,year:2026,signal:controller.signal}),/cancelled/)
  cancelled=undefined
  const remaining=await f.source.home('series-domestic',{page:2,year:2026})
  const overseas=await f.source.home('series-overseas',{year:2026}),overseas2=await f.source.home('series-overseas',{page:2,year:2026})
  const domesticIds=new Set([...domestic.items,...remaining.items].map(x=>x.id)),overseasIds=new Set([...overseas.items,...overseas2.items].map(x=>x.id))
  assert.equal(domesticIds.size,26);assert.equal(overseasIds.size,25)
  assert.ok([...domesticIds].every(id=>!overseasIds.has(id)));assert.ok(!domesticIds.has('202')&&!overseasIds.has('202'))
  assert.deepEqual((await f.source.home('anime-domestic',{year:2026})).items.map(x=>x.id),['203','205'])
  assert.deepEqual((await f.source.home('anime-overseas',{year:2026})).items.map(x=>x.id),['204'])
  assert.ok(f.peak()<=3)
})
test('Saved home choice accepts the eight stable IDs and defaults safely to All',()=>{
  assert.equal(savedHomeCategory(undefined),'all');assert.equal(savedHomeCategory('series'),'all')
  assert.equal(savedHomeCategory('anime-overseas'),'anime-overseas');assert.equal(savedHomeCategory({id:'movie'}),'all')
})
test('Unwanted older regional pages cannot exhaust the first-page budget before newer accepted titles',async()=>{
  const f=fixture([...Array.from({length:25},(_,i)=>row(i+1,13,'中国大陆')),...Array.from({length:500},(_,i)=>row(i+101,16,'美国'))])
  const first=await f.source.home('series-domestic',{year:2026})
  assert.equal(first.items.length,20);assert.equal(first.next,2)
  assert.equal(f.urls.filter(url=>{const q=new URL(url).searchParams;return q.get('t')==='16'&&Number(q.get('pg'))>1}).length,0)
})
test('Check timestamps are padded 24-hour China time across day and year boundaries',()=>{
  assert.equal(formatChinaDateTime(Date.UTC(2026,10,4,1,5,8)),'2026-11-04 09:05:08')
  assert.equal(formatChinaDateTime(Date.UTC(2026,11,31,16,0,1)),'2027-01-01 00:00:01')
  assert.equal(chinaYear(Date.UTC(2026,11,31,16)),2027)
  for(const value of [0,-1,NaN,Infinity,1e20])assert.equal(formatChinaDateTime(value),'尚未检查')
})
