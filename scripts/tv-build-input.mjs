import {createHash} from 'node:crypto'
import {readFileSync,readdirSync} from 'node:fs'
import {join} from 'node:path'
export function digestTree(directory){const hash=createHash('sha256');function walk(path,prefix=''){for(const row of readdirSync(path,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const file=join(path,row.name),name=prefix+row.name;if(row.isDirectory())walk(file,name+'/');else hash.update(name).update('\0').update(readFileSync(file)).update('\0')}}walk(directory);return hash.digest('hex')}
export function sourceDigest(root){const hash=createHash('sha256').update(digestTree(join(root,'src')));for(const file of ['package.json','package-lock.json','vite.config.ts','tsconfig.json','index.html','scripts/build-tv.mjs','scripts/build-phone.mjs','scripts/prepare-android-stage.mjs','scripts/compile-player-library.mjs','scripts/hbuilderx.mjs'])hash.update(file).update('\0').update(readFileSync(join(root,file)));return hash.digest('hex')}
