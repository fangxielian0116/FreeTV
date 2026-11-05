import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { hbuilderx } from '../hbuilderx.mjs'

const required = ['DCLOUD_USERNAME', 'DCLOUD_PASSWORD', 'ANDROID_KEYSTORE_BASE64',
  'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD', 'ANDROID_STORE_PASSWORD']
const missing = required.filter(name => !process.env[name])
if (missing.length) throw new Error(`Configure GitHub Actions secrets: ${missing.join(', ')}. See docs/github-actions.md.`)
if (!process.argv.includes('--validate')) {
  if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('This entry point is for GitHub Actions only; use npm run pack:android or pack:tv locally.')
  const target = process.env.BUILD_TARGET || 'both'
  if (!['phone', 'tv', 'both'].includes(target)) throw new Error('Unknown build target')
  const root = resolve(import.meta.dirname, '../..'), { cli, home } = hbuilderx(root)
  const signingFile = join(root, '.signing/android-test.json'), keyFolder = join(root, '.signing/ci')
  if (existsSync(signingFile) || existsSync(keyFolder)) throw new Error('Refusing to overwrite existing signing files')
  mkdirSync(keyFolder, { recursive: true })
  try {
    const certfile = join(keyFolder, 'android.jks')
    writeFileSync(certfile, Buffer.from(process.env.ANDROID_KEYSTORE_BASE64, 'base64'), { mode: 0o600 })
    writeFileSync(signingFile, JSON.stringify({ certfile, certalias: process.env.ANDROID_KEY_ALIAS,
      certpassword: process.env.ANDROID_KEY_PASSWORD, storepassword: process.env.ANDROID_STORE_PASSWORD }), { mode: 0o600, flag: 'wx' })
    const opened = spawnSync(cli, ['open'], { cwd: home, encoding: 'utf8', timeout: 90000 })
    if (opened.error || opened.status !== 0) throw new Error('HBuilderX CLI could not start')
    const login = spawnSync(cli, ['user', 'login', '--username', process.env.DCLOUD_USERNAME,
      '--password', process.env.DCLOUD_PASSWORD], { cwd: home, encoding: 'utf8', timeout: 90000 })
    // Do not forward login output, which may contain account/session information.
    if (login.error || login.status !== 0 || !/user login\s*:\s*OK/i.test(login.stdout + login.stderr)) {
      throw new Error('DCloud login failed. Check account credentials and complete any required account verification in HBuilderX.')
    }
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
