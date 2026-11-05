import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import {AbortController} from '../src/platform/cancellation'
import {itemKey,type CatalogPage} from '../src/domain/catalog'
import {readSearchQuery} from '../src/domain/search-query'

function page(request:()=>Promise<CatalogPage>) {
  const noop=()=>{};let hide=()=>{}
  const modules:Record<string,unknown>={
    '@/platform/target':{TV_BUILD:false},'@/platform/tv-page':{useTVPage:noop},
    '@/services/title-index':{rememberTitleSearch:noop},'@/domain/search-query':{readSearchQuery},
    '@/platform/cancellation':{AbortController},vue:{ref:(value:unknown)=>({value}),computed:(get:()=>unknown)=>({get value(){return get()}}),nextTick:async()=>{}},
    '@dcloudio/uni-app':{onLoad:noop,onShow:noop,onHide:(callback:()=>void)=>{hide=callback},onUnload:noop},
    '@/domain/catalog':{itemKey},'@/services/catalog':{searchCatalog:async()=>({source:{id:'fixture'},page:await request()})},
    '@/services/source-store':{sourceState:{currentId:'fixture',mode:'fixed'}},
  }
  const code=readFileSync(new URL('../src/pages/search/search.vue',import.meta.url),'utf8').match(/<script setup[^>]*>([\s\S]*?)<\/script>/)![1]
  const compiled=ts.transpileModule(code+`\nexport const enter=(value:string)=>{input.value=value;search()};export const inspect=()=>({empty:showNoResults.value,busy:busy.value,error:error.value});`,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText
  const exports:Record<string,unknown>={}
  vm.runInNewContext(compiled,{exports,require:(id:string)=>{if(id.endsWith('.vue'))return {};if(!(id in modules))throw Error('Missing search test dependency '+id);return modules[id]},uni:{},Date,console})
  return {enter:exports.enter as (value:string)=>void,inspect:exports.inspect as ()=>{empty:boolean;busy:boolean;error:string},hide:()=>hide()}
}
const empty:CatalogPage={items:[],page:1,next:null,total:0}
const settled=()=>new Promise(resolve=>setImmediate(resolve))
test('Phone search shows no empty message before submitting, then shows it for a successful empty response',async()=>{
  const screen=page(async()=>empty);assert.equal(screen.inspect().empty,false)
  screen.enter('');assert.equal(screen.inspect().empty,false)
  screen.enter('不存在的片名');assert.equal(screen.inspect().busy,true);assert.equal(screen.inspect().empty,false)
  await settled();assert.equal(screen.inspect().empty,true);assert.equal(screen.inspect().error,'')
})
test('Phone search reports a request error without also claiming there were no matching films',async()=>{
  const screen=page(async()=>{throw Error('请求超时')});screen.enter('狂飙');await settled()
  assert.equal(screen.inspect().error,'请求超时');assert.equal(screen.inspect().empty,false)
})
test('Leaving during a search cannot turn an incomplete request into an empty result',async()=>{
  let release:(value:CatalogPage)=>void=()=>{}
  const screen=page(()=>new Promise(resolve=>{release=resolve}));screen.enter('狂飙');screen.hide()
  release(empty);await settled();assert.equal(screen.inspect().busy,false);assert.equal(screen.inspect().empty,false)
})
