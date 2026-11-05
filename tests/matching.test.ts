import test from 'node:test'
import assert from 'node:assert/strict'
import { parseDetail } from '../src/domain/maccms'
import { episodeIdentity, matchEpisode, sameWork, searchTerms } from '../src/domain/matching'
const work = (source: string, name = '现在就出发第四季', extra = {}) => parseDetail(source, { vod_id: 1, vod_name: name, vod_year: '2026', type_name: '大陆综艺', vod_actor: '张三,李四', ...extra })
test('Shared identity matches substantially different titles but cannot override season or year conflicts', () => {
  const a = work('a', '甲', { vod_douban_id: 123 }), b = work('b', '完全不同的别名', { vod_douban_id: 123 })
  assert.equal(sameWork(a, b), true)
  assert.equal(sameWork(work('a', '出发第三季', { vod_douban_id: 123 }), work('b', '出发第四季', { vod_douban_id: 123 })), false)
  assert.equal(sameWork(a, { ...b, year: '2025' }), false)
})
test('Traditional titles and Chinese season numbers match without conflating seasons', () => {
  assert.equal(sameWork(work('a'), work('b', '現在就出發第4季')), true)
  assert.equal(sameWork(work('a'), work('b', '现在就出发第五季')), false)
  assert.equal(sameWork(work('a','灿烂的转身'),work('b','燦爛的轉身')),true)
  assert.ok(searchTerms(work('a','現在就出發第四季')).includes('现在就出发'))
})
test('Known aliases still require corroborating metadata and queries stay bounded', () => {
  assert.equal(sameWork(work('a', '原名'), work('b', '别名'), ['别名']), true)
  assert.equal(sameWork(work('a', '原名', { vod_year: '', vod_actor: '' }), work('b', '原名', { vod_year: '', vod_actor: '' })), false)
  assert.ok(searchTerms(work('a'), ['别名1', '别名2', '别名3']).length <= 3)
})
test('Episode match never substitutes a pure cut or the upper half for the lower half', () => {
  const detail = work('b', undefined, { vod_play_from: 'm3u8', vod_play_url: '20261101下纯享$https://example.com/pure.m3u8#20261031上$https://example.com/up.m3u8#20261101下$https://example.com/down.m3u8' })
  const original = { key: 'old', routeId: 'old', label: '20261101下', url: '', index: 0 }
  assert.equal(matchEpisode(original, detail, 'variety')?.url, 'https://example.com/down.m3u8')
  assert.equal(matchEpisode({ ...original, label: '20261108下' }, detail, 'variety'), undefined)
})
test('Explicit episode ordinals can survive provider date errors; dates alone cannot infer equivalence', () => {
  const detail = work('b', undefined, { vod_play_from: 'm3u8', vod_play_url: '20260925第10期下$https://example.com/10.m3u8' })
  assert.equal(matchEpisode({ key: '', routeId: '', label: '20261001第10期下', url: '', index: 0 }, detail, 'variety')?.index, 0)
  assert.equal(matchEpisode({ key: '', routeId: '', label: '20261001下', url: '', index: 0 }, detail, 'variety'), undefined)
  assert.equal(episodeIdentity('HD中字').part, '')
})
