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
  const result = spawnSync(cli, ['user', 'login', '--username', process.env.DCLOUD_USERNAME,
    '--password', process.env.DCLOUD_PASSWORD], { cwd: home, encoding: 'utf8', timeout: 90000 })
  // Login output can contain account/session information. Never forward it.
  if (result.error || result.status !== 0 || !/user login\s*:\s*OK/i.test(result.stdout + result.stderr)) {
    throw new Error('DCloud login failed. Check account credentials and complete any required account verification in HBuilderX.')
  }
  console.log('DCloud login succeeded')
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) login(resolve(import.meta.dirname, '../..'))
