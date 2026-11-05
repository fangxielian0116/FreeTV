import test from 'node:test'
import assert from 'node:assert/strict'
import { loadCatalog, searchCatalog } from '../src/services/catalog'
import { sourceState, selectSource, candidates } from '../src/services/source-store'
import { BUILTIN_SOURCES } from '../src/domain/sources'

const payload = (found = true) => ({ code: 1, page: 1, pagecount: 1, list: found ? [{ vod_id: 1, vod_name: '测试剧', vod_year: '2026', type_name: '国产剧' }] : [] })
async function mockRequests(handler: (url: string, index: number) => unknown, run: (urls: string[]) => Promise<void>) {
  const previous = (globalThis as any).uni, urls: string[] = []
  const memory = new Map()
  ;(globalThis as any).uni = { getStorageSync: (key: string) => memory.get(key), setStorageSync: (key: string, value: unknown) => memory.set(key,value), request(options: any) {
    urls.push(options.url); let cancelled = false
    queueMicrotask(() => { if (!cancelled) { const value = handler(options.url, urls.length - 1); value instanceof Error ? options.fail({errMsg:value.message}) : options.success({statusCode:200,data:JSON.stringify(value),header:{}}) } })
    return { abort() { cancelled = true; options.fail({errMsg:'abort'}) } }
  } }
  sourceState.sources = BUILTIN_SOURCES.map(x=>({...x})); sourceState.online = true; sourceState.observations = []; selectSource('xigua','auto')
  try { await run(urls) } finally { (globalThis as any).uni = previous }
}
test('Healthy directory access preserves the selected provider despite ranking changes', async () => {
  await mockRequests(() => payload(), async urls => {
    selectSource('bf'); const result = await loadCatalog()
    assert.equal(result.source.id, 'bf'); assert.equal(sourceState.currentId,'bf'); assert.equal(urls.length,1)
  })
})
test('An empty search checks exactly one alternative and commits only a real result', async () => {
  await mockRequests((_url,index) => payload(index===1), async urls => {
    const expected = candidates(new Set(['xigua']))[0].id
    const result = await searchCatalog('测试剧')
    assert.equal(urls.length,2); assert.equal(result.changed,true); assert.equal(sourceState.currentId,expected)
  })
  await mockRequests(() => payload(false), async urls => {
    await searchCatalog('不存在'); assert.equal(urls.length,2); assert.equal(sourceState.currentId,'xigua')
  })
})
test('Fixed mode and invalidated searches never replace the selected provider', async () => {
  await mockRequests(() => payload(false), async urls => {
    selectSource('bf','fixed'); await searchCatalog('未找到'); assert.equal(urls.length,1); assert.equal(sourceState.currentId,'bf')
  })
  await mockRequests((_url,index) => payload(index===1), async () => {
    const result = await searchCatalog('过期搜索',{canCommit:()=>false})
    assert.equal(result.changed,false); assert.equal(sourceState.currentId,'xigua')
  })
})
test('Directory recovery resets provider-specific category IDs before accepting a new directory', async () => {
  await mockRequests(url => {const query=new URL(url).searchParams;return query.get('ac')==='list'?{...payload(false),class:[]}:query.get('t')==='old-category'?new Error('unavailable'):payload()}, async urls => {
    const result = await loadCatalog({category:'old-category'})
    assert.equal(result.changed,true); assert.ok(urls.some(url=>url.includes('t=old-category'))); assert.doesNotMatch(urls[urls.length-1],/[?&]t=/)
  })
})

test('Unknown region metadata never penalizes or switches an otherwise responding directory',async()=>{
  await mockRequests(url=>new URL(url).searchParams.get('ac')==='list'?{list:[],class:[{type_id:4,type_name:'动漫片'}]}:{code:1,page:1,pagecount:1,list:[{vod_id:1,vod_name:'地区未标注的动画',type_id:4,type_name:'动漫片',vod_year:new Date().getFullYear()}]},async()=>{
    sourceState.sources.find(source=>source.id==='xigua')!.api+='?fixture=region-unknown'
    const result=await loadCatalog({kind:'anime-overseas'})
    assert.equal(result.page.items.length,0);assert.equal(sourceState.currentId,'xigua');assert.deepEqual(sourceState.observations,[])
  })
})
