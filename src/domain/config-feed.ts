import type { SourceDefinition } from './catalog'
import { normalizeApi } from './sources'
import { utf8Bytes } from './http-url'

/** Read a literal, never JavaScript: calls, expressions and references are rejected. */
export function extractSourceFeed(script: string, existing: SourceDefinition[]): SourceDefinition[] {
  if (script.length > 2 * 1024 * 1024) throw new Error('配置文件过大')
  const marker = /\bconst\s+COLLECT_GROUPS\s*=/.exec(script)
  if (!marker) throw new Error('源清单格式已变化')
  let cursor = marker.index + marker[0].length, nodes = 0
  function space() {
    for (;;) {
      while (/\s/.test(script[cursor] || '') && cursor < script.length) cursor++
      if (script.slice(cursor, cursor + 2) === '//') { cursor = script.indexOf('\n', cursor); if (cursor < 0) throw new Error('配置未结束'); continue }
      if (script.slice(cursor, cursor + 2) === '/*') { const end = script.indexOf('*/', cursor + 2); if (end < 0) throw new Error('配置注释未结束'); cursor = end + 2; continue }
      break
    }
  }
  function string() {
    const quote = script[cursor++]; let value = ''
    while (cursor < script.length) {
      const char = script[cursor++]; if (char === quote) return value
      if (char !== '\\') { value += char; continue }
      const escape = script[cursor++], escapes: Record<string, string> = { n:'\n',r:'\r',t:'\t',b:'\b',f:'\f',v:'\v','0':'\0' }
      if (escape === 'u' || escape === 'x') { const length = escape === 'u' ? 4 : 2, hex = script.slice(cursor, cursor + length); if (!new RegExp(`^[a-f0-9]{${length}}$`, 'i').test(hex)) throw new Error('配置转义无效'); value += String.fromCharCode(parseInt(hex, 16)); cursor += length }
      else value += escapes[escape] ?? escape
    }
    throw new Error('配置字符串未结束')
  }
  function value(depth = 0): any {
    if (depth > 16 || ++nodes > 10000) throw new Error('配置过于复杂')
    space(); const char = script[cursor]
    if (char === '"' || char === "'") return string()
    if (char === '[' || char === '{') {
      cursor++; const array = char === '[', result: any = array ? [] : Object.create(null), close = array ? ']' : '}'
      space()
      while (script[cursor] !== close) {
        if (array) result.push(value(depth + 1))
        else {
          space(); let key: string
          if (["'", '"'].includes(script[cursor])) key = string()
          else { const match = /^[A-Za-z_$][\w$]*/.exec(script.slice(cursor)); if (!match) throw new Error('无效的配置字段'); key = match[0]; cursor += key.length }
          space(); if (script[cursor++] !== ':') throw new Error('配置字段缺少值')
          result[key] = value(depth + 1)
        }
        space(); if (script[cursor] === ',') { cursor++; space() } else if (script[cursor] !== close) throw new Error('配置包含不支持的表达式')
      }
      cursor++; return result
    }
    const literal = /^(true|false|null|-?\d+(?:\.\d+)?)(?![\w$])/.exec(script.slice(cursor))
    if (!literal) throw new Error('配置包含非静态内容')
    cursor += literal[0].length; return JSON.parse(literal[0])
  }
  const groups = value(); if (!Array.isArray(groups)) throw new Error('缺少源清单')
  const sources = new Map<string, SourceDefinition>()
  for (const group of groups) {
    if (!['采集源', 'EcoHub'].includes(group.sec) || !Array.isArray(group.items)) continue
    for (const item of group.items) {
      if (item.fmt !== 'maccms10' || typeof item.name !== 'string' || typeof item.api !== 'string' || !item.api) continue
      let api: string; try { api = normalizeApi(item.api) } catch { continue }
      const known = existing.find(source => source.aliases.includes(item.name) || normalizeApi(source.api) === api)
      const id = known?.id || `feed-${sha256(item.name).slice(0, 12)}`
      if (sources.has(id)) continue
      sources.set(id, { id, name: known?.name || item.name.slice(0, 40), api, aliases: [...new Set([...(known?.aliases || []), item.name])], prior: known?.prior ?? .65, enabled: true })
    }
  }
  if (!sources.size || sources.size > 128) throw new Error('源清单为空或数量异常')
  return [...sources.values()]
}

export function sha256(text: string) {
  const k = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]
  const bytes = utf8Bytes(text), length = Math.ceil((bytes.length + 9) / 64) * 64, buffer = new Uint8Array(length); buffer.set(bytes); buffer[bytes.length] = 128
  const data = new DataView(buffer.buffer); data.setUint32(length - 8, Math.floor(bytes.length / 0x20000000)); data.setUint32(length - 4, bytes.length * 8)
  const h = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19], w = new Uint32Array(64), rotate = (x: number, n: number) => (x >>> n) | (x << (32 - n))
  for (let offset = 0; offset < length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = data.getUint32(offset + i * 4)
    for (let i = 16; i < 64; i++) { const a = w[i - 15], b = w[i - 2]; w[i] = w[i - 16] + (rotate(a,7) ^ rotate(a,18) ^ (a >>> 3)) + w[i - 7] + (rotate(b,17) ^ rotate(b,19) ^ (b >>> 10)) }
    let [a,b,c,d,e,f,g,z] = h
    for (let i = 0; i < 64; i++) { const t1 = (z + (rotate(e,6) ^ rotate(e,11) ^ rotate(e,25)) + ((e & f) ^ (~e & g)) + k[i] + w[i]) | 0, t2 = ((rotate(a,2) ^ rotate(a,13) ^ rotate(a,22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0; z=g; g=f; f=e; e=(d+t1)|0; d=c; c=b; b=a; a=(t1+t2)|0 }
    ;[a,b,c,d,e,f,g,z].forEach((x, i) => { h[i] = (h[i] + x) | 0 })
  }
  return h.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('')
}
