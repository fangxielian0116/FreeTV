// Download public Maven compile dependencies only. No source, keys or project data leave this machine.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, join, delimiter } from 'node:path'
import { createHash } from 'node:crypto'
import AdmZip from 'adm-zip'
import { nativeToolchain } from './hbuilderx.mjs'
const root = resolve(import.meta.dirname, '..'), output = join(root, '.cache/native-check')
const { plugins } = nativeToolchain(root)
await mkdir(output, { recursive: true })
const coordinates = [
  ['io.github.carguo','gsyvideoplayer-java','14.0.0'], ['io.github.carguo','gsyvideoplayer-base','14.0.0'], ['io.github.carguo','gsyvideoplayer-exo2','14.0.0'], ['io.github.carguo','gsyijkjava','1.0.0'],
  ...['common','container','datasource','decoder','extractor','database','exoplayer','exoplayer-hls','ui'].map(name => ['androidx.media3',`media3-${name}`,'1.10.1']),
  ['androidx.annotation','annotation-jvm','1.9.1'], ['androidx.sqlite','sqlite','2.3.1'], ['androidx.sqlite','sqlite-framework','2.3.1'], ['com.google.guava','guava','33.3.1-android'],
]
const artifacts = []; let cursor = 0
async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`)
  const body = Buffer.from(await response.arrayBuffer()); if (body.length > 30 * 1024 * 1024) throw new Error('Dependency exceeds size limit')
  return body
}
await Promise.all(Array.from({ length: 4 }, async () => {
  while (cursor < coordinates.length) {
    const [group, artifact, version] = coordinates[cursor++], base = `${group.replaceAll('.', '/')}/${artifact}/${version}/${artifact}-${version}`
    const repository = group.startsWith('androidx.') ? 'https://dl.google.com/dl/android/maven2/' : 'https://repo.maven.apache.org/maven2/'
    const jar = join(output, `${artifact}-${version}.jar`)
    if (!existsSync(jar)) {
      const pom = (await download(`${repository}${base}.pom`)).toString('utf8'), extension = /<packaging>aar<\/packaging>/.test(pom) ? 'aar' : 'jar'
      const body = await download(`${repository}${base}.${extension}`)
      await writeFile(jar, extension === 'aar' ? new AdmZip(body).readFile('classes.jar') : body)
    }
    const bytes = await readFile(jar)
    artifacts.push({ coordinate: `${group}:${artifact}:${version}`, repository, jar, sha256: createHash('sha256').update(bytes).digest('hex') })
    console.log(`${artifact} ${version}: ready`)
  }
}))
const classpath = [join(plugins,'uniapp-runextension/kotlinc/lib/kotlin-stdlib.jar'), join(plugins,'uts-development-android/static/android.jar'), join(plugins,'uniapp-runextension/lib/utsplugin-release.jar'), ...artifacts.map(x => x.jar)]
await writeFile(join(output, 'classpath.txt'), classpath.join(delimiter))
await writeFile(join(output, 'artifacts.json'), JSON.stringify(artifacts, null, 2))
console.log('Local Kotlin compile classpath prepared; this does not replace APK/device verification.')
