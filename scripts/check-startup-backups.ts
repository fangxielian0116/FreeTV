import {writeFileSync} from 'node:fs'
import {BUILTIN_SOURCES} from '../src/domain/sources'
import {directRoutes} from '../src/domain/catalog'
import {MacCMSSource} from '../src/services/catalog-source'
import {sameWork,matchEpisode,searchTerms} from '../src/domain/matching'

async function main(){
  const original=await new MacCMSSource(BUILTIN_SOURCES[0]).detail('88994')
  const episode=directRoutes(original).flatMap(route=>route.episodes).find(item=>item.label==='20261101下')
  if(!episode)throw Error('Requested main episode missing from source metadata')
  const results=[]
  for(const id of ['qiyi','modu']){
    const source=BUILTIN_SOURCES.find(row=>row.id===id)!,adapter=new MacCMSSource(source)
    let found=false
    for(const term of searchTerms(original)){
      const page=await adapter.search(term)
      for(const item of page.items.filter(item=>sameWork(original,item)).slice(0,3)){
        const detail=await adapter.detail(item.id),matched=matchEpisode(episode,detail,original.kind)
        if(!sameWork(original,detail)||!matched)continue
        const row={sourceId:id,name:source.name,api:source.api,vodId:detail.id,title:detail.title,episode:matched.label,url:matched.url}
        results.push(row);console.log(`${source.name}: confirmed ${detail.title} / ${matched.label}`);found=true;break
      }
      if(found)break
    }
    if(!found)console.log(`${source.name}: no confidently matched episode`)
  }
  writeFileSync('artifacts/0.2.0/startup-backup-input.json',JSON.stringify(results,null,2))
}
void main().catch(error=>{console.error(error.message);process.exitCode=1})
