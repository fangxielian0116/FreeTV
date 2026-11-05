import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCategories, parseDetail, parsePayload } from '../src/domain/maccms'
import { MacCMSSource } from '../src/services/catalog-source'
import { BUILTIN_SOURCES } from '../src/domain/sources'

test('MacCMS routes retain stable episode keys across URL refresh and correctly separate upper/lower', () => {
  const row = { vod_id: 9, vod_name: '测试综艺', type_name: '大陆综艺', vod_play_from: 'web$$$testm3u8', vod_play_url: '第4期上$https://example.com/play.html$$$第4期上$https://example.com/up.m3u8#第4期下$https://example.com/down.m3u8?token=a' }
  const parsed = parseDetail('a', row)
  assert.equal(parsed.routes.length, 1)
  assert.deepEqual(parsed.routes[0].episodes.map(x => x.label), ['第4期上', '第4期下'])
  const refreshed = parseDetail('a', { ...row, vod_play_url: row.vod_play_url.replace('token=a', 'token=b') })
  assert.equal(refreshed.routes[0].episodes[1].key, parsed.routes[0].episodes[1].key)
})
test('XML directory pagination, metadata and route flags are retained', () => {
  const xml = '<?xml version="1.0"?><rss><list page="2" pagecount="4" recordcount="80"><video><id>7</id><name><![CDATA[甲 & 乙]]></name><type>国产剧</type><actor>张三,李四</actor><year>2026</year><dl><dd flag="xmlm3u8"><![CDATA[第01集$https://example.com/1.m3u8]]></dd></dl></video></list><class><ty id="1">国产剧</ty></class></rss>'
  const payload = parsePayload(xml), detail = parseDetail('xml', payload.list[0])
  assert.equal(payload.page, 2); assert.equal(payload.pagecount, 4)
  assert.equal(detail.title, '甲 & 乙'); assert.equal(detail.routes[0].id, 'xmlm3u8')
  assert.deepEqual(detail.cast, ['张三', '李四'])
})
test('Directory requests use detail pagination and require the requested ID in detail responses', async () => {
  const urls: string[] = []
  const source = new MacCMSSource(BUILTIN_SOURCES[0], async url => { urls.push(url); return { status: 200, text: JSON.stringify({ code: 1, page: 1, pagecount: 2, total: 40, list: [{ vod_id: 5, vod_name: '甲', type_name: '国产剧' }] }), headers: {} } })
  const page = await source.list({ page: 1 }); assert.equal(page.next, 2); assert.equal(new URL(urls[0]).searchParams.get('ac'), 'detail')
  await assert.rejects(source.detail('6'), /无法找到/)
})
test('403 is a source error, never a reason to call a suggest endpoint', async () => {
  let calls = 0
  const source = new MacCMSSource(BUILTIN_SOURCES[0], async () => { calls++; return { status: 403, text: 'Forbidden', headers: {} } })
  await assert.rejects(source.search('甲'), /403/); assert.equal(calls, 1)
})
test('Unrelated categories and executable playback entries are not admitted', () => {
  assert.equal(parseCategories([{ type_id: 1, type_name: '成人' }]).length, 0)
  assert.equal(parseCategories([{ type_id: 2, type_name: '里番动漫' }]).length, 0)
  assert.equal(parseCategories([{type_id:'3',type_pid:'0',type_name:'综艺片'}])[0].parentId,undefined)
  const detail = parseDetail('a', { vod_id: 1, vod_name: '甲', vod_play_url: '假视频$javascript:alert(1)#网页$https://example.com/watch' })
  assert.equal(detail.routes.length, 0)
})
