import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

export function hbuilderx(root) {
  const executable = process.env.FREETV_HBUILDERX
    ? resolve(process.env.FREETV_HBUILDERX)
    : join(root, '.tools/HBuilderX-5.26/HBuilderX', process.platform === 'win32' ? 'HBuilderX.exe' : 'HBuilderX')
  const home = dirname(executable), plugins = join(home, 'plugins')
  const java = join(plugins, 'amazon-corretto/bin', process.platform === 'win32' ? 'java.exe' : 'java')
  return { executable, home, plugins, java, cli: join(home, process.platform === 'win32' ? 'cli.exe' : 'cli') }
}

export function nativeToolchain(root) {
  const tools = hbuilderx(root)
  for (const file of [tools.java,
    join(tools.plugins, 'uniapp-runextension/kotlinc/lib/kotlin-compiler.jar'),
    join(tools.plugins, 'uniapp-runextension/kotlinc/lib/kotlin-stdlib.jar'),
    join(tools.plugins, 'uts-development-android/static/android.jar'),
    join(tools.plugins, 'uniapp-runextension/lib/utsplugin-release.jar')]) {
    if (!existsSync(file)) throw new Error(`Missing HBuilderX native tool: ${file}. Install HBuilderX 5.26 with Android UTS and App development plugins; see docs/build.md.`)
  }
  return tools
}
