import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'

const root = resolve(import.meta.dirname, '..')
const hx = process.env.FREETV_HBUILDERX || join(root, '.tools/HBuilderX-5.26/HBuilderX/HBuilderX.exe')
const keytool = join(dirname(hx), 'plugins/amazon-corretto/bin/keytool.exe')
const folder = join(root, '.signing')
const certfile = join(folder, 'freetv-demo-test.jks')
const settingsFile = join(folder, 'android-test.json')
if (existsSync(settingsFile) && existsSync(certfile)) {
  console.log('Local Android test signing already exists. Keeping the existing identity.')
} else {
  if (existsSync(certfile) || existsSync(settingsFile)) throw new Error('Incomplete signing files exist. Check them manually; refusing to overwrite a signing identity.')
  if (!existsSync(keytool)) throw new Error('HBuilderX bundled keytool is missing. Install the App development tools first.')
  mkdirSync(folder, { recursive: true })
  const password = randomBytes(24).toString('base64url')
  const result = spawnSync(keytool, ['-genkeypair', '-storetype', 'JKS', '-keystore', certfile,
    '-alias', 'freetv-demo', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '3650',
    '-dname', 'CN=FreeTV Demo, OU=Local Testing', '-storepass:env', 'FREETV_SIGNING_PASSWORD',
    '-keypass:env', 'FREETV_SIGNING_PASSWORD', '-noprompt'], {
    env: { ...process.env, FREETV_SIGNING_PASSWORD: password }, encoding: 'utf8', windowsHide: true,
  })
  if (result.error || result.status !== 0) throw new Error('Test signing creation failed. Check the local Java toolchain.')
  writeFileSync(settingsFile, JSON.stringify({ certalias: 'freetv-demo', certfile, certpassword: password, storepassword: password }, null, 2), { mode: 0o600 })
  console.log('Created local Android test signing in .signing/. Keep this directory private and backed up.')
}
