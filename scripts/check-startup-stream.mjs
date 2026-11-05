import {readFileSync,writeFileSync} from 'node:fs'
const input=JSON.parse(readFileSync('artifacts/0.2.0/startup-playback-input.json','utf8'))[0]
const report={at:new Date().toISOString(),episode:input.episode,manifests:[],samples:[]}
let url=input.url
try{
  for(let depth=0;depth<3;depth++){
    const response=await fetch(url,{signal:AbortSignal.timeout(10000)})
    if(!response.ok)throw Error(`Manifest HTTP ${response.status}`)
    const body=await response.text(),lines=body.split(/\r?\n/).filter(line=>line&&!line.startsWith('#'))
    report.manifests.push({url:response.url,status:response.status,entries:lines.length})
    if(body.includes('#EXT-X-STREAM-INF')){url=new URL(lines[0],response.url).href;continue}
    const keys=[...body.matchAll(/#EXT-X-KEY:[^\r\n]*URI="([^"]+)"/g)].map(match=>new URL(match[1],response.url).href)
    const samples=[...new Set([...keys,...lines.slice(0,8).map(line=>new URL(line,response.url).href)])]
    report.samples=await Promise.all(samples.map(async target=>{try{const result=await fetch(target,{method:'HEAD',signal:AbortSignal.timeout(10000)});return {url:target,status:result.status}}catch(error){return {url:target,error:error.cause?.code||error.message}}}))
    break
  }
}catch(error){report.error=error.cause?.code||error.message}
writeFileSync('artifacts/0.2.0/startup-stream-network-check.json',JSON.stringify(report,null,2))
console.log(JSON.stringify(report,null,2))
