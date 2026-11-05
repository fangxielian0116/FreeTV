import {spawn} from 'node:child_process'
import {resolve,join} from 'node:path'
import {prepareAndroidStage} from './prepare-android-stage.mjs'
import {mkdirSync,writeFileSync} from 'node:fs'
import {sourceDigest,digestTree} from './tv-build-input.mjs'
const root=resolve(import.meta.dirname,'..'),platform=process.argv.includes('--h5')?'h5':'app'
const stage=prepareAndroidStage(root,'tv',process.argv.includes('--preview'))
const inputHash=sourceDigest(root)
const child=spawn(process.execPath,[join(root,'node_modules/@dcloudio/vite-plugin-uni/bin/uni.js'),...(process.argv.includes('--dev')?['--host','127.0.0.1','--port','5174']:['build','-p',platform])],{
  cwd:stage,stdio:'inherit',windowsHide:true,
  env:{...process.env,FREETV_TARGET:'tv',UNI_INPUT_DIR:join(stage,'src'),UNI_OUTPUT_DIR:join(root,`dist/${process.argv.includes('--dev')?'dev':'build'}/tv-${platform}`)},
})
child.on('exit',code=>{
  process.exitCode=code??1
  if(!code&&!process.argv.includes('--dev')){
    if(sourceDigest(root)!==inputHash){console.error('Source changed during the TV build; rebuild before packaging.');process.exitCode=1;return}
    const out=join(root,'artifacts/tv');mkdirSync(out,{recursive:true})
    writeFileSync(join(out,`ui-${platform}-build-receipt.json`),JSON.stringify({at:new Date().toISOString(),sourceHash:inputHash,platform,compiled:join(root,`dist/build/tv-${platform}`),compiledHash:digestTree(join(root,`dist/build/tv-${platform}`))},null,2))
  }
})
