import {writeFileSync, mkdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {BUILTIN_SOURCES} from '../src/domain/sources'
import {directRoutes} from '../src/domain/catalog'
import {MacCMSSource} from '../src/services/catalog-source'
import {isMainEpisode,normalizeTitle} from '../src/domain/matching'

async function main(){
const root=process.cwd(),out=resolve(root,'artifacts/0.2.0')
mkdirSync(out,{recursive:true})
let cursor=0
const results: any[]=[]
await Promise.all(Array.from({length:3},async()=>{
  while(cursor<BUILTIN_SOURCES.length){
    const source=BUILTIN_SOURCES[cursor++],api=new MacCMSSource(source),began=Date.now()
    const row:any={sourceId:source.id,name:source.name,api:source.api}
    try{
      const directory=await api.list();row.directoryItems=directory.items.length;row.total=directory.total
      if(!directory.items.length)throw new Error('No usable directory')
      const found=await api.search('现在就出发');row.searchItems=found.items.length
      const item=found.items.find(x=>/现在就出发第(?:4|四)季/.test(normalizeTitle(x.title)))||directory.items.find(x=>['movie','tv','variety'].includes(x.kind))||directory.items[0]
      const detail=await api.detail(item.id),episodes=directRoutes(detail).flatMap(x=>x.episodes).filter(isMainEpisode)
      const episode=episodes.find(x=>/第0?4期下|20261017下/.test(x.label))||episodes[0]
      if(!episode)throw new Error('No direct main-content stream')
      Object.assign(row,{status:'catalog-ready',vodId:detail.id,title:detail.title,episode:episode.label,url:episode.url,elapsedMs:Date.now()-began})
    }catch(error){Object.assign(row,{status:'unverified',reason:(error as Error).message,elapsedMs:Date.now()-began})}
    results.push(row);console.log(`${source.name}: ${row.status}${row.title?' · '+row.title+' · '+row.episode:' · '+row.reason}`)
  }
}))
results.sort((a,b)=>BUILTIN_SOURCES.findIndex(x=>x.id===a.sourceId)-BUILTIN_SOURCES.findIndex(x=>x.id===b.sourceId))
writeFileSync(resolve(out,'source-catalog-check.json'),JSON.stringify({at:new Date().toISOString(),environment:'Windows network; playback requires the separate Android instrumentation run',results},null,2))
writeFileSync(resolve(out,'source-playback-input.json'),JSON.stringify(results.filter(x=>x.status==='catalog-ready'),null,2))
}
void main().catch(error=>{console.error(error.message);process.exitCode=1})
