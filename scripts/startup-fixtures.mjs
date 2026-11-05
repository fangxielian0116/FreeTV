import {createServer} from 'node:http'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
const root=resolve('.cache/player-fixtures'),counts=new Map()
createServer((request,response)=>{
  const path=new URL(request.url,'http://127.0.0.1').pathname
  const match=/^\/case\/([a-z0-9-]+)\/(entry\.m3u8|master\.m3u8|media\/[a-z0-9_.-]+)$/.exec(path)
  if(path.startsWith('/stats/')){response.setHeader('Content-Type','application/json');response.end(JSON.stringify(Object.fromEntries([...counts].filter(([key])=>key.includes('/case/'+path.slice(7)+'/')))));return}
  if(!match){response.writeHead(404).end();return}
  counts.set(path,(counts.get(path)||0)+1)
  const [,name,file]=match
  if(file==='entry.m3u8'){response.writeHead(302,{Location:`/case/${name}/master.m3u8`}).end();return}
  if(file==='master.m3u8'){
    setTimeout(()=>{response.setHeader('Content-Type','application/vnd.apple.mpegurl');response.end(name.startsWith('invalid')?'invalid playlist':'#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=1920x1080\nmedia/index.m3u8\n')},name.startsWith('slow')?2000:120);return
  }
  try{const body=readFileSync(resolve(root,file.slice(6)));response.setHeader('Content-Type',file.endsWith('.m3u8')?'application/vnd.apple.mpegurl':'video/mp2t');setTimeout(()=>response.end(body),file.endsWith('.m3u8')?120:0)}catch{response.writeHead(404).end()}
}).listen(8756,'127.0.0.1',()=>console.log('Startup redirect/relative-playlist fixtures on 127.0.0.1:8756'))
