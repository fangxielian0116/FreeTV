import {writeFileSync} from 'node:fs'
import {createTitleIndex,titleSyncState} from '../src/services/title-index'
import {requestText} from '../src/services/http'
async function main(){
  const disk=new Map<string,unknown>(),index=createTitleIndex({read:key=>disk.get(key),write:(key,value)=>disk.set(key,value),request:requestText})
  await index.resume()
  const report={at:new Date().toISOString(),state:{...titleSyncState},hot:index.suggestions(''),example:index.suggestions('kb'),snapshots:[...disk]}
  writeFileSync('artifacts/tv/title-source-check.json',JSON.stringify(report,null,2))
  console.log(JSON.stringify({count:report.state.count,message:report.state.message,hot:report.hot.map(row=>row.title)}))
  if(report.state.count===0||report.state.updatedAt===0)process.exitCode=1
}
void main()
