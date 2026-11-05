import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { ServiceAbortController } from '../src/platform/cancellation'
import { parseHttpUrl, withQuery, utf8Bytes } from '../src/domain/http-url'
import { sha256 } from '../src/domain/config-feed'
import { episodeIdentity, sameWork } from '../src/domain/matching'
import { parseItem } from '../src/domain/maccms'

test('Android service cancellation works without browser EventTarget and only dispatches once', () => {
  const controller = new ServiceAbortController(); let count = 0
  const removed = () => { count += 100 }
  controller.signal.addEventListener('abort', () => count++)
  controller.signal.addEventListener('abort', removed)
  controller.signal.removeEventListener('abort', removed)
  controller.abort(); controller.abort()
  assert.equal(controller.signal.aborted, true); assert.equal(count, 1)
})
test('HTTP helpers retain provider query arguments and reject executable, credential and malformed URLs', () => {
  assert.equal(withQuery('https://example.com/api?token=public&wd=old#ignored', { wd: '现在就出发', pg: 2 }), 'https://example.com/api?token=public&wd=%E7%8E%B0%E5%9C%A8%E5%B0%B1%E5%87%BA%E5%8F%91&pg=2')
  for (const input of ['javascript:alert(1)', 'https://user:secret@example.com/', 'https://x.example\\evil/', 'https://x.example:99999/']) assert.throws(() => parseHttpUrl(input))
  assert.equal(parseHttpUrl('http://[::1]:8010/a').origin, 'http://[::1]:8010')
})
test('UTF-8 hashing works without TextEncoder, including surrogate replacements', () => {
  const input = '中文🙂\ud800'; assert.deepEqual(utf8Bytes(input), new Uint8Array(Buffer.from(input)))
  assert.equal(sha256(input), createHash('sha256').update(input).digest('hex'))
})
test('Missing season metadata can use shared identity, while explicit conflicting seasons cannot', () => {
  const item = (title: string) => parseItem('test', { vod_id: 1, vod_name: title, vod_douban_id: '123', type_name: '国产剧' })
  assert.equal(sameWork(item('出发第四季'), item('出发')), true)
  assert.equal(sameWork(item('出发第四季'), item('出发S03')), false)
  assert.equal(episodeIdentity('上海滩第01集').part, '')
  assert.equal(episodeIdentity('20261101').ordinal, undefined)
  assert.equal(episodeIdentity('第04期（下）').part, '下')
})
