import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { hbuilderx } from '../hbuilderx.mjs'

export function login(root) {
  if (!process.env.DCLOUD_USERNAME || !process.env.DCLOUD_PASSWORD) throw new Error('Configure DCLOUD_USERNAME and DCLOUD_PASSWORD secrets')
  const { cli, home } = hbuilderx(root)
  // The Linux daemon inherits stdout/stderr from `cli open`. Captured pipes
  // would keep spawnSync waiting after the CLI client has already exited.
  const opened = spawnSync(cli, ['open'], { cwd: home, stdio: 'ignore', timeout: 90000 })
  if (opened.error || opened.status !== 0) throw new Error('HBuilderX CLI could not start')
  console.log('HBuilderX CLI started')
  const result = spawnSync(cli, ['user', 'login', '--username', process.env.DCLOUD_USERNAME,
    '--password', process.env.DCLOUD_PASSWORD], { cwd: home, encoding: 'utf8', timeout: 90000 })
  // Login output can contain account/session information. Never forward it.
  const output = String(result.stdout || '') + String(result.stderr || '')
  if (result.error || result.status !== 0 || !/user login\s*:\s*(OK|success)|登录成功/i.test(output)) {
    const categories = [
      [/密码|密碼|password|credentials|invalid account/i, 'account or password rejected'],
      [/验证码|驗證碼|captcha/i, 'interactive verification required'],
      [/实名|實名|real.name/i, 'account identity verification required'],
      [/网络|網絡|连接|連接|超时|network|connect|timeout/i, 'service connection failed'],
    ]
    const reason = categories.find(([pattern]) => pattern.test(output))?.[1] || 'unrecognized CLI response'
    const code = /(?:^|\n)\s*(-?\d+):user login:/i.exec(output)?.[1] || 'none'
    throw new Error(`DCloud login failed: ${reason}; CLI code ${code}; exit ${result.status}; process error ${result.error?.code || 'none'}. Check the GitHub Secrets and account verification. Raw login output is suppressed.`)
  }
  console.log('DCloud login succeeded')
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) login(resolve(import.meta.dirname, '../..'))
