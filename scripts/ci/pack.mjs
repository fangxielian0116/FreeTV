import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { login } from './login.mjs'

const required = ['DCLOUD_USERNAME', 'DCLOUD_PASSWORD', 'ANDROID_KEYSTORE_BASE64',
  'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD', 'ANDROID_STORE_PASSWORD']
const missing = required.filter(name => !process.env[name])
if (missing.length) throw new Error(`Configure GitHub Actions secrets: ${missing.join(', ')}. See docs/github-actions.md.`)
if (!process.argv.includes('--validate')) {
  if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('This entry point is for GitHub Actions only; use npm run pack:android or pack:tv locally.')
  const target = process.env.BUILD_TARGET || 'both'
  if (!['phone', 'tv', 'both'].includes(target)) throw new Error('Unknown build target')
  const root = resolve(import.meta.dirname, '../..')
  const signingFile = join(root, '.signing/android-test.json'), keyFolder = join(root, '.signing/ci')
  if (existsSync(signingFile) || existsSync(keyFolder)) throw new Error('Refusing to overwrite existing signing files')
  mkdirSync(keyFolder, { recursive: true })
  try {
    const certfile = join(keyFolder, 'android.jks')
    writeFileSync(certfile, Buffer.from(process.env.ANDROID_KEYSTORE_BASE64, 'base64'), { mode: 0o600 })
    writeFileSync(signingFile, JSON.stringify({ certfile, certalias: process.env.ANDROID_KEY_ALIAS,
      certpassword: process.env.ANDROID_KEY_PASSWORD, storepassword: process.env.ANDROID_STORE_PASSWORD }), { mode: 0o600, flag: 'wx' })
    login(root)
    for (const platform of target === 'both' ? ['phone', 'tv'] : [target]) {
      const result = spawnSync(process.execPath, [join(root, 'scripts/pack-android.mjs'), platform === 'tv' ? '--tv' : '--staged'],
        { cwd: root, stdio: 'inherit', timeout: 45 * 60 * 1000 })
      if (result.error || result.status !== 0) throw new Error(`${platform} APK packaging failed`)
    }
  } finally {
    rmSync(signingFile, { force: true })
    rmSync(keyFolder, { recursive: true, force: true })
  }
}
