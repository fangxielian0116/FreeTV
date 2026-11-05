import {parseHttpUrl} from '@/domain/http-url'
import {readLocal,writeLocal} from './storage'

export interface PosterAsset { path:string; size:number; persistent:boolean }
export interface PosterEntry extends PosterAsset { url:string; savedAt:number; usedAt:number }
export interface PosterSnapshot { entries:PosterEntry[]; aliases:[string,string][] }
export interface PosterBackend { load(url:string):Promise<PosterAsset>; remove(path:string):Promise<void> }
interface Subscriber { resolve:(value:PosterAsset)=>void; reject:(error:Error)=>void; clean:()=>void }
interface Job { url:string; host:string; priority:number; order:number; active:boolean; subscribers:Set<Subscriber> }
const cancelled=()=>new Error('封面请求已取消')

/** Shared image work, visible-first scheduling and a bounded, URL-addressed disk index. */
export class PosterCache {
  private entries=new Map<string,PosterEntry>()
  private aliases=new Map<string,string>()
  private jobs=new Map<string,Job>()
  private cooling=new Map<string,number>()
  private hosts=new Map<string,number>()
  private running=0;private sequence=0;private scheduled=false
  constructor(private backend:PosterBackend,private options:{snapshot?:PosterSnapshot;persist?:(value:PosterSnapshot)=>void;now?:()=>number;maxFiles?:number;maxBytes?:number;concurrency?:number;perHost?:number;freshMs?:number}={}){
    for(const entry of Array.isArray(options.snapshot?.entries)?options.snapshot.entries:[]) {
      // Only files created by uni.saveFile belong to this cache's deletion scope.
      if(entry&&entry.persistent&&/^_doc\/uniapp_save\/[\w.-]+$/.test(entry.path)&&Number.isFinite(entry.size)&&entry.size>0&&Number.isFinite(entry.savedAt)&&Number.isFinite(entry.usedAt)){
        try{parseHttpUrl(entry.url);this.entries.set(entry.url,{...entry})}catch{/* discard a malformed cache record */}
      }
    }
    for(const pair of Array.isArray(options.snapshot?.aliases)?options.snapshot.aliases:[])if(Array.isArray(pair)&&typeof pair[0]==='string'&&this.entries.has(pair[1]))this.aliases.set(pair[0],pair[1])
    this.trim()
  }
  private now(){return this.options.now?.()??Date.now()}
  peek(url:string){const entry=this.entries.get(url);if(entry)entry.usedAt=this.now();return entry}
  previous(key:string){const url=this.aliases.get(key);return url?this.peek(url):undefined}
  remember(key:string,url:string){if(key&&this.entries.has(url)&&this.aliases.get(key)!==url){this.aliases.set(key,url);this.save()}}
  private save(){try{this.options.persist?.({entries:[...this.entries.values()].filter(entry=>entry.persistent),aliases:[...this.aliases].filter(([,url])=>this.entries.get(url)?.persistent)})}catch{/* an image cache must not block browsing */}}
  invalidate(url:string,path?:string){const entry=this.entries.get(url);if(entry&&(!path||entry.path===path)){this.entries.delete(url);for(const [key,value] of this.aliases)if(value===url)this.aliases.delete(key);if(entry.persistent)void this.backend.remove(entry.path).catch(()=>{});this.save()}this.cooling.delete(url)}
  promote(url:string,priority:number){const job=this.jobs.get(url);if(job&&!job.active){job.priority=Math.min(job.priority,priority);this.schedule()}}
  request(url:string,priority=1,signal?:AbortSignal):Promise<PosterAsset>{
    if(signal?.aborted)return Promise.reject(cancelled())
    let host:string;try{host=parseHttpUrl(url).origin}catch{return Promise.reject(new Error('无效的封面地址'))}
    const cached=this.peek(url)
    if(cached&&this.now()-cached.savedAt<(this.options.freshMs??7*86400000))return Promise.resolve(cached)
    if((this.cooling.get(url)||0)>this.now())return Promise.reject(new Error('封面稍后重试'))
    let job=this.jobs.get(url)
    if(!job){job={url,host,priority,order:++this.sequence,active:false,subscribers:new Set()};this.jobs.set(url,job)}
    else job.priority=Math.min(job.priority,priority)
    const current=job
    return new Promise((resolve,reject)=>{
      const abort=()=>{current.subscribers.delete(subscriber);subscriber.clean();reject(cancelled());if(!current.active&&!current.subscribers.size&&this.jobs.get(url)===current)this.jobs.delete(url)}
      const subscriber:Subscriber={resolve,reject,clean:()=>signal?.removeEventListener('abort',abort)}
      current.subscribers.add(subscriber);signal?.addEventListener('abort',abort,{once:true})
      if(signal?.aborted)abort();else this.schedule()
    })
  }
  private schedule(){if(this.scheduled)return;this.scheduled=true;void Promise.resolve().then(()=>{this.scheduled=false;this.pump()})}
  private pump(){
    while(this.running<(this.options.concurrency??4)){
      const job=[...this.jobs.values()].filter(job=>!job.active&&job.subscribers.size&&(this.hosts.get(job.host)||0)<(this.options.perHost??2)).sort((a,b)=>a.priority-b.priority||a.order-b.order)[0]
      if(!job)return
      job.active=true;this.running++;this.hosts.set(job.host,(this.hosts.get(job.host)||0)+1)
      void this.run(job)
    }
  }
  private async run(job:Job){
    try{
      const asset=await this.backend.load(job.url)
      if(!asset.path||!Number.isFinite(asset.size)||asset.size<0)throw new Error('无效的封面文件')
      const previous=this.entries.get(job.url)
      if(previous?.persistent&&previous.path!==asset.path){const key=job.url+'#poster-retired-'+(++this.sequence);this.entries.set(key,{...previous,url:key,usedAt:previous.savedAt})}
      this.entries.set(job.url,{...asset,url:job.url,savedAt:this.now(),usedAt:this.now()});this.cooling.delete(job.url)
      this.trim(job.url);this.save()
      // Old same-URL files remain tracked by the bounded LRU while a new image paints.
      for(const subscriber of job.subscribers){subscriber.clean();subscriber.resolve(asset)}
    }catch(error){
      this.cooling.set(job.url,this.now()+1200)
      while(this.cooling.size>160)this.cooling.delete(this.cooling.keys().next().value!)
      for(const subscriber of job.subscribers){subscriber.clean();subscriber.reject(error instanceof Error?error:new Error('封面加载失败'))}
    }finally{job.subscribers.clear();if(this.jobs.get(job.url)===job)this.jobs.delete(job.url);this.running--;this.hosts.set(job.host,Math.max(0,(this.hosts.get(job.host)||1)-1));this.pump()}
  }
  private trim(protectedUrl=''){
    let bytes=[...this.entries.values()].reduce((sum,entry)=>sum+entry.size,0)
    const oldest=[...this.entries.values()].filter(entry=>entry.url!==protectedUrl).sort((a,b)=>a.usedAt-b.usedAt)
    while(this.entries.size>(this.options.maxFiles??160)||bytes>(this.options.maxBytes??32*1024*1024)){
      const entry=oldest.shift();if(!entry)break;this.entries.delete(entry.url);bytes-=entry.size
      for(const [key,url] of this.aliases)if(url===entry.url)this.aliases.delete(key)
      if(entry.persistent)void this.backend.remove(entry.path).catch(()=>{})
    }
  }
}

const INDEX='freetv:v3:poster-cache:v1'
function nativeBackend():PosterBackend {
  const removeTemp=(path:string)=>{if(/^_doc\/uniapp_temp[^/]*\/download\/[\w.%()-]+$/.test(path))uni.removeSavedFile({filePath:path,fail:()=>{}})}
  return {
    async load(url){
      const download=await new Promise<UniApp.DownloadSuccessData>((resolve,reject)=>uni.downloadFile({url,timeout:20000,success:resolve,fail:reject}))
      let keepTemporary=false
      try {
      if(download.statusCode<200||download.statusCode>=300)throw new Error('封面服务器暂不可用')
      const info=await new Promise<UniApp.GetImageInfoSuccessData>((resolve,reject)=>uni.getImageInfo({src:download.tempFilePath,success:resolve,fail:reject}))
      if(!info.width||!info.height)throw new Error('封面内容不是图片')
      const file=await new Promise<UniApp.GetFileInfoSuccess>((resolve,reject)=>uni.getFileInfo({filePath:download.tempFilePath,success:resolve,fail:reject}))
      if(file.size>4*1024*1024)throw new Error('封面文件过大')
      try {
        const saved=await new Promise<UniApp.SaveFileSuccess>((resolve,reject)=>uni.saveFile({tempFilePath:download.tempFilePath,success:resolve,fail:reject}))
        return {path:saved.savedFilePath,size:file.size,persistent:true}
      }catch{keepTemporary=true;return {path:download.tempFilePath,size:file.size,persistent:false}}
      }finally{if(!keepTemporary)removeTemp(download.tempFilePath)}
    },
    remove(path){return new Promise((resolve,reject)=>uni.removeSavedFile({filePath:path,success:()=>resolve(),fail:reject}))},
  }
}
let repository:PosterCache|undefined
export function posterCache(){
  if(!repository){
    let native=false
    // #ifdef APP-PLUS
    native=typeof uni!=='undefined'&&typeof uni.downloadFile==='function'
    // #endif
    repository=new PosterCache(native?nativeBackend():{load:async url=>({path:url,size:0,persistent:false}),remove:async()=>{}},{snapshot:native?readLocal<PosterSnapshot>(INDEX):undefined,persist:native?value=>writeLocal(INDEX,value):undefined})
  }
  return repository
}
