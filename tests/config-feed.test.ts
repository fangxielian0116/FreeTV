import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { extractSourceFeed, sha256 } from '../src/domain/config-feed'
import { BUILTIN_SOURCES } from '../src/domain/sources'
test('Hash handles unicode and multiple blocks without native crypto dependency', () => {
  for (const value of ['', 'abc', '现在就出发'.repeat(500)]) assert.equal(sha256(value), createHash('sha256').update(value).digest('hex'))
})
test('Static extraction accepts comments/trailing commas, keeps source IDs, and merges mirrors', () => {
  const script = `const COLLECT_GROUPS = [{ sec: '采集源', items: [/* comment */{name:'西瓜',api:'https://new.example.com',fmt:'maccms10'}, {name:'魔都2',api:'https://modu.example.com',fmt:'maccms10'}, {name:'魔都',api:'https://modu.example.com',fmt:'maccms10'}, {name:'网页',api:'https://example.com',fmt:'search'},],},]; throw new Error('must never execute');`
  const sources = extractSourceFeed(script, BUILTIN_SOURCES)
  assert.equal(sources.length, 2); assert.equal(sources[0].id, 'xigua'); assert.equal(sources[0].api, 'https://new.example.com/api.php/provide/vod/')
  assert.equal(sources[1].id, 'modu')
})
test('Remote calls, identifier references, invalid schemes and empty feeds are rejected', () => {
  assert.throws(() => extractSourceFeed('const COLLECT_GROUPS = stealCookies();', BUILTIN_SOURCES), /非静态/)
  assert.throws(() => extractSourceFeed('const COLLECT_GROUPS = [window.foo];', BUILTIN_SOURCES), /非静态/)
  assert.throws(() => extractSourceFeed("const COLLECT_GROUPS=[{sec:'采集源',items:[{name:'a',fmt:'maccms10',api:'javascript:bad'}]}]", BUILTIN_SOURCES), /为空/)
})
