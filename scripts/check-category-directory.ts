import {mkdirSync,writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {MacCMSSource} from '../src/services/catalog-source'
import {BUILTIN_SOURCES} from '../src/domain/sources'

async function main(){
  const results:unknown[]=[]
  for(const id of ['xigua','modu','bf']){
    const source=BUILTIN_SOURCES.find(value=>value.id===id)!,adapter=new MacCMSSource(source)
    const categories=await adapter.categories()
    const groups=categories.filter(category=>!category.parentId&&['movie','series','variety','anime'].includes(category.kind))
    for(const category of groups){
      const began=Date.now(),first=await adapter.list({category:category.id}),second=first.next?await adapter.list({category:category.id,page:first.next}):undefined
      const firstIds=new Set(first.items.map(item=>item.id)),overlap=second?.items.filter(item=>firstIds.has(item.id)).length||0
      if(!first.items.length||overlap)throw new Error(`${source.name}/${category.name}: empty category or duplicate page`)
      const row={source:source.id,category:category.name,categoryId:category.id,total:first.total,firstCount:first.items.length,secondCount:second?.items.length||0,duplicateCount:overlap,types:[...new Set(first.items.map(item=>item.categories[0]?.name))],examples:first.items.slice(0,3).map(item=>item.title),elapsedMs:Date.now()-began}
      results.push(row);console.log(JSON.stringify(row))
    }
  }
  const directory=resolve('artifacts/0.2.0');mkdirSync(directory,{recursive:true})
  writeFileSync(resolve(directory,'category-directory-check.json'),JSON.stringify({at:new Date().toISOString(),results},null,2))
}
void main().catch(error=>{console.error(error);process.exitCode=1})
