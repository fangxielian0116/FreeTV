import test from 'node:test'
import assert from 'node:assert/strict'
import {PosterCache,type PosterAsset,type PosterSnapshot} from '../src/services/poster-cache'

const tick=()=>new Promise<void>(resolve=>setImmediate(resolve))
const asset=(id:string,size=30):PosterAsset=>({path:`_doc/uniapp_save/${id}.jpg`,size,persistent:true})
function harness(options:ConstructorParameters<typeof PosterCache>[1]={}){
  const starts:string[]=[],removed:string[]=[],pending=new Map<string,{resolve:(value:PosterAsset)=>void;reject:(error:Error)=>void}>()
  let snapshot:PosterSnapshot={entries:[],aliases:[]}
  const cache=new PosterCache({load:url=>{starts.push(url);return new Promise((resolve,reject)=>pending.set(url,{resolve,reject}))},remove:async path=>{removed.push(path)}},{...options,persist:value=>snapshot=structuredClone(value)})
  return {cache,starts,removed,pending,snapshot:()=>snapshot}
}
test('Same-URL views share one download; cancelling one consumer keeps the other and stores a reusable file',async()=>{
  const h=harness(),url='https://img.example/a.jpg',controller=new AbortController()
  const a=h.cache.request(url,0,controller.signal),rejected=assert.rejects(a,/取消/),b=h.cache.request(url)
  await tick();assert.deepEqual(h.starts,[url]);controller.abort();await rejected
  h.pending.get(url)!.resolve(asset('a'));assert.equal((await b).path,asset('a').path)
  assert.equal((await h.cache.request(url)).path,asset('a').path);assert.equal(h.starts.length,1)
})
test('Visible tasks move ahead of queued work while slow hosts cannot occupy every download slot',async()=>{
  const h=harness({concurrency:3,perHost:1})
  const urls=['https://slow.example/a','https://slow.example/b','https://other.example/c','https://fast.example/d']
  const promises=urls.map((url,i)=>h.cache.request(url,i===3?0:2))
  await tick();assert.deepEqual(h.starts,[urls[3],urls[0],urls[2]])
  h.pending.get(urls[0])!.resolve(asset('a'));await tick();assert.ok(h.starts.includes(urls[1]))
  for(let i=1;i<urls.length;i++)h.pending.get(urls[i])!.resolve(asset(String(i)))
  await Promise.all(promises)
})
test('A queued request removed during navigation never starts; active work still becomes useful cache',async()=>{
  const h=harness({concurrency:1}),a='https://img.example/a',b='https://img.example/b',controller=new AbortController()
  const first=h.cache.request(a),second=h.cache.request(b,1,controller.signal),rejected=assert.rejects(second,/取消/)
  await tick();controller.abort();await rejected;h.pending.get(a)!.resolve(asset('a'));await first;await tick()
  assert.deepEqual(h.starts,[a]);assert.ok(h.cache.peek(a))
})
test('Reopening the cache works offline and aliases retain a prior poster when a source changes its URL',async()=>{
  const h=harness(),old='https://img.example/old.jpg',next='https://img.example/new.jpg'
  const request=h.cache.request(old);await tick();h.pending.get(old)!.resolve(asset('old'));await request;h.cache.remember('source:work',old)
  const reopened=new PosterCache({load:async()=>{throw new Error('offline')},remove:async()=>{}},{snapshot:h.snapshot()})
  assert.equal((await reopened.request(old)).path,asset('old').path)
  assert.equal(reopened.previous('source:work')!.path,asset('old').path)
  await assert.rejects(reopened.request(next),/offline/)
  assert.equal(reopened.previous('source:work')!.path,asset('old').path)
})
test('Expired images stay available while one background replacement runs; old files remain tracked and bounded',async()=>{
  let now=100
  const h=harness({now:()=>now,freshMs:20,maxFiles:2}),url='https://img.example/a.jpg'
  const first=h.cache.request(url);await tick();h.pending.get(url)!.resolve(asset('old'));await first
  now=200;const second=h.cache.request(url);await tick();assert.equal(h.cache.peek(url)!.path,asset('old').path)
  h.pending.get(url)!.resolve(asset('new'));await second;assert.equal(h.cache.peek(url)!.path,asset('new').path)
  assert.equal(h.snapshot().entries.length,2);assert.ok(h.snapshot().entries.some(entry=>entry.path===asset('old').path))
})
test('LRU bounds disk usage and only removes files owned by its index',async()=>{
  let now=100
  const h=harness({now:()=>now,maxFiles:2,maxBytes:80})
  for(const name of ['a','b']){const url=`https://img.example/${name}`;const p=h.cache.request(url);await tick();h.pending.get(url)!.resolve(asset(name));await p;now++}
  h.cache.peek('https://img.example/a');now++
  const p=h.cache.request('https://img.example/c');await tick();h.pending.get('https://img.example/c')!.resolve(asset('c'));await p
  assert.equal(h.snapshot().entries.length,2);assert.deepEqual(h.removed,[asset('b').path])
})
test('Broken cache files can be invalidated without throwing away a newer replacement',async()=>{
  const h=harness(),url='https://img.example/a'
  const p=h.cache.request(url);await tick();h.pending.get(url)!.resolve(asset('a'));await p
  h.cache.invalidate(url,asset('different').path);assert.ok(h.cache.peek(url))
  h.cache.invalidate(url,asset('a').path);assert.equal(h.cache.peek(url),undefined)
  const retry=h.cache.request(url);await tick();h.pending.get(url)!.resolve(asset('repaired'));await retry
  assert.equal(h.starts.length,2)
})
test('Failures do not become permanent cache entries; a short cooldown avoids duplicate retry storms',async()=>{
  let now=100;const h=harness({now:()=>now}),url='https://img.example/fail'
  const first=h.cache.request(url),rejected=assert.rejects(first,/404/);await tick();h.pending.get(url)!.reject(new Error('404'));await rejected
  await assert.rejects(h.cache.request(url),/稍后/);assert.equal(h.starts.length,1);assert.equal(h.cache.peek(url),undefined)
  now+=1300;const retry=h.cache.request(url);await tick();h.pending.get(url)!.resolve(asset('recovered'));await retry
})
test('Malformed or unrelated persisted file records are ignored without deleting user files',()=>{
  const removed:string[]=[]
  const snapshot={entries:[null,{url:'https://img.example/a',path:'/sdcard/user-photo.jpg',persistent:true,size:3,savedAt:1,usedAt:1}],aliases:[null,{},['a','missing']]} as unknown as PosterSnapshot
  const cache=new PosterCache({load:async()=>asset('a'),remove:async path=>{removed.push(path)}},{snapshot})
  assert.equal(cache.peek('https://img.example/a'),undefined);assert.deepEqual(removed,[])
})
