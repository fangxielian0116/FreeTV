// Package our native implementation through uni-app's supported Android libs/*.jar path.
// The IDE's source-to-declaration parser is not needed for private implementation classes.
import {readFileSync,writeFileSync,readdirSync,mkdirSync,existsSync} from 'node:fs'
import {join} from 'node:path'
import {spawnSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {nativeToolchain} from './hbuilderx.mjs'
export function compilePlayerLibrary(root) {
  const {plugins,java}=nativeToolchain(root)
  const source=join(root,'src/uni_modules/freetv-player/utssdk/app-android')
  const cache=join(root,'.cache/native-check'),classpathFile=join(cache,'classpath.txt')
  if(!existsSync(classpathFile))throw Error('Prepare native dependencies first: node scripts/prepare-native-check.mjs')
  const files=readdirSync(source).filter(name=>name.endsWith('.kt')).sort().map(name=>join(source,name))
  const hash=createHash('sha256').update(readFileSync(classpathFile))
  for(const file of files)hash.update(file).update(readFileSync(file))
  const sourceHash=hash.digest('hex'),output=join(cache,'freetv-player-library.jar'),receipt=join(cache,'player-library-receipt.json')
  const sha=path=>createHash('sha256').update(readFileSync(path)).digest('hex')
  if(existsSync(receipt)&&existsSync(output)){
    const previous=JSON.parse(readFileSync(receipt,'utf8'))
    if(previous.sourceHash===sourceHash&&previous.sha256===sha(output))return previous
  }
  mkdirSync(cache,{recursive:true})
  const result=spawnSync(java,['-Dfile.encoding=UTF-8','-cp',join(plugins,'uniapp-runextension/kotlinc/lib/*'),'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler',...files,'-classpath',readFileSync(classpathFile,'utf8').trim(),'-jvm-target','17','-no-stdlib','-no-reflect','-d',output],{cwd:root,encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:4*1024*1024})
  if(result.status!==0)throw Error('Native player library compilation failed: '+(result.error||result.stdout+result.stderr))
  const record={sourceHash,output,sha256:sha(output),method:'bundled Kotlin compiler; original source files; uni-app Android libs jar'}
  writeFileSync(receipt,JSON.stringify(record,null,2))
  return record
}
