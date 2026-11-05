import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { resolve,join } from 'node:path'
const output = resolve(import.meta.dirname,'../.cache/player-fixtures')
mkdirSync(output,{recursive:true})
const result = spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc=size=1920x1080:rate=24','-t','45','-pix_fmt','yuv420p','-c:v','libx264','-preset','veryfast','-crf','28','-maxrate','3M','-bufsize','6M','-g','48','-keyint_min','48','-sc_threshold','0','-f','hls','-hls_time','2','-hls_list_size','0','-hls_segment_filename',join(output,'chunk%02d.ts'),join(output,'index.m3u8')],{windowsHide:true,encoding:'utf8'})
if(result.status!==0) throw new Error(result.stderr||'FFmpeg fixture generation failed')
console.log('Generated local synthetic 1080p HLS fixture, 45 seconds.')
const fallback = join(output,'720'); mkdirSync(fallback,{recursive:true})
const low = spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc=size=1280x720:rate=24','-t','45','-pix_fmt','yuv420p','-c:v','libx264','-preset','veryfast','-crf','28','-maxrate','1500k','-bufsize','3M','-g','48','-keyint_min','48','-sc_threshold','0','-f','hls','-hls_time','2','-hls_list_size','0','-hls_segment_filename',join(fallback,'chunk%02d.ts'),join(fallback,'index.m3u8')],{windowsHide:true,encoding:'utf8'})
if(low.status!==0)throw new Error(low.stderr||'720p fixture generation failed')
console.log('Generated a separately labelled 720p backup fixture.')
