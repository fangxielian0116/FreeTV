import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
const root = resolve(import.meta.dirname, '..')
const manifest = JSON.parse(readFileSync(join(root, 'src/manifest.json'), 'utf8'))
const hx = process.env.FREETV_HBUILDERX || join(root, '.tools/HBuilderX-5.26/HBuilderX/HBuilderX.exe')
const sdk = process.env.ANDROID_HOME || join(root, '.tools/AndroidSDK')
console.log(`FreeTV ${manifest.versionName}\nNode ${process.version}\nHBuilderX: ${existsSync(hx) ? hx : 'missing'}\nAndroid SDK: ${sdk}\nPackage: ${manifest['app-plus'].distribute.android.packagename}`)
console.log(`Native module: ${existsSync(join(root, 'src/uni_modules/freetv-player/utssdk/app-android/FreeTVPlayerActivity.kt')) ? 'GSYVideoPlayer 14.0.0 / Media3 1.10.1' : 'missing'}`)
console.log(`Existing Android signing: ${existsSync(join(root, '.signing/android-test.json')) ? 'configured' : 'missing'}`)
const adb = join(sdk, 'platform-tools/adb.exe')
if (existsSync(adb)) { const result = spawnSync(adb, ['devices', '-l'], { encoding: 'utf8', timeout: 7000, windowsHide: true }); console.log(result.error ? result.error.message : result.stdout.trim()) }
console.log('Resource builds do not replace native compilation, a signed APK, or on-device verification.')
