import {writeFileSync} from 'node:fs'
import {MacCMSSource} from '../src/services/catalog-source'
import {HOME_CATEGORIES,homeClassifier} from '../src/domain/home'
import {BUILTIN_SOURCES} from '../src/domain/sources'

async function main(){
  let active=0,peak=0
  const adapter=new MacCMSSource(BUILTIN_SOURCES[0],async(url)=>{
    active++;peak=Math.max(peak,active)
    try {const response=await fetch(url,{signal:AbortSignal.timeout(8000)});return {status:response.status,text:await response.text(),headers:{}}}finally{active--}
  })
  const classifier=homeClassifier(await adapter.categories()),results=[]
  for(const category of HOME_CATEGORIES){
    const began=Date.now()
    try {
      const page=await adapter.home(category.id)
      if(!page.items.length)throw new Error('Empty recent category')
      if(page.next!==null&&page.items.length<20)throw new Error('Recent category returned a partial first page')
      if(category.kind&&page.items.some(item=>classifier.kind(item)!==category.kind))throw new Error('Mixed content types')
      if(category.region&&page.items.some(item=>classifier.region(item)!==category.region))throw new Error('Mixed production regions')
      const row={category:category.id,name:category.name,count:page.items.length,elapsedMs:Date.now()-began,samples:page.items.slice(0,3).map(item=>({title:item.title,category:item.categories[0]?.name,areas:item.areas,region:classifier.region(item)})),passed:true}
      results.push(row);console.log(JSON.stringify(row))
    }catch(error){results.push({category:category.id,name:category.name,passed:false,error:String(error)});console.log(JSON.stringify(results.at(-1)))}
  }
  writeFileSync('artifacts/0.2.0/categories-live-check.json',JSON.stringify({at:new Date().toISOString(),source:'xigua',peakConcurrentRequests:peak,results},null,2))
  if(results.some(row=>!row.passed)||peak>3)process.exitCode=1
}
void main()
