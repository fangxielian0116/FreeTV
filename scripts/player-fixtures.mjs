import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
const root = resolve(import.meta.dirname,'../.cache/player-fixtures')
if (!existsSync(join(root,'index.m3u8'))) throw new Error('Generate the local HLS fixture before starting the server.')
const server = createServer((request,response) => {
  const match = /^\/(healthy|backup|backup720|slow|broken)(?:-\d+)?\/([a-z0-9_.-]+)$/.exec(request.url || '')
  const file = match ? join(root,match[1]==='backup720'?'720':'',match[2]) : ''
  if (!match || !existsSync(file)) { response.writeHead(404); response.end(); return }
  if (match[1]==='broken' && match[2].endsWith('.ts')) { response.writeHead(404); response.end(); return }
  const data = readFileSync(file)
  response.writeHead(200,{'content-type':match[2].endsWith('.m3u8')?'application/vnd.apple.mpegurl':'video/mp2t','content-length':data.length})
  if (match[1]!=='slow' || match[2].endsWith('.m3u8')) { response.end(data); return }
  let offset = 0
  const timer = setInterval(() => { const end = Math.min(data.length,offset+4096); response.write(data.subarray(offset,end)); offset=end; if(offset===data.length){clearInterval(timer);response.end()} },200)
  response.on('close',()=>clearInterval(timer))
})
server.listen(8754,'127.0.0.1',()=>console.log('Local native playback fixtures listening on 127.0.0.1:8754'))
