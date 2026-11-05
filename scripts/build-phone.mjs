import {spawn} from 'node:child_process'
import {resolve,join} from 'node:path'
import {mkdirSync,writeFileSync} from 'node:fs'
import {prepareAndroidStage} from './prepare-android-stage.mjs'
import {sourceDigest,digestTree} from './tv-build-input.mjs'
const root=resolve(import.meta.dirname,'..'),platform=process.argv.includes('--h5')?'h5':'app'
const stage=prepareAndroidStage(root,'phone',true),inputHash=sourceDigest(root)
const child=spawn(process.execPath,[join(root,'node_modules/@dcloudio/vite-plugin-uni/bin/uni.js'),'build','-p',platform],{
  cwd:stage,stdio:'inherit',windowsHide:true,
  env:{...process.env,FREETV_TARGET:'phone',UNI_INPUT_DIR:join(stage,'src'),UNI_OUTPUT_DIR:join(root,`dist/build/${platform}`)},
})
child.on('exit',code=>{
  process.exitCode=code??1
  if(!code){
    if(sourceDigest(root)!==inputHash){console.error('Source changed during the phone build.');process.exitCode=1;return}
    const out=join(root,'artifacts/phone');mkdirSync(out,{recursive:true})
    writeFileSync(join(out,`ui-${platform}-build-receipt.json`),JSON.stringify({at:new Date().toISOString(),sourceHash:inputHash,platform,compiled:join(root,`dist/build/${platform}`),compiledHash:digestTree(join(root,`dist/build/${platform}`))},null,2))
  }
})
