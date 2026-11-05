// uni-app's Android service runtime does not provide browser URL/TextEncoder APIs.
export function parseHttpUrl(input: string) {
  if (/[\s\\<>\u0000-\u001f]/.test(input)) throw new Error('无效的网络地址')
  const match = /^(https?):\/\/([^/?#]+)([^?#]*)(\?[^#]*)?(?:#.*)?$/i.exec(input)
  if (!match || !/^(?:[a-z0-9.-]+|\[[a-f0-9:]+\])(?::\d{1,5})?$/i.test(match[2])) throw new Error('无效的网络地址')
  const port = /:(\d+)$/.exec(match[2]); if (port && Number(port[1]) > 65535) throw new Error('无效的网络端口')
  const origin = `${match[1].toLowerCase()}://${match[2].toLowerCase()}`
  const pathname = match[3] || '/', search = match[4] || ''
  return { origin, pathname, search, href: origin + pathname + search }
}
export function withQuery(input: string, params: Record<string, string | number>) {
  const url = parseHttpUrl(input)
  const previous = url.search.slice(1).split('&').filter(Boolean).filter(pair => {
    try { return !(decodeURIComponent(pair.split('=')[0]) in params) } catch { return false }
  })
  return url.origin + url.pathname + '?' + [...previous, ...Object.entries(params).map(([key,value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)].join('&')
}
export function utf8Bytes(text: string) {
  const bytes: number[] = []
  for (const char of text) {
    let code = char.codePointAt(0)!
    if (code >= 0xd800 && code <= 0xdfff) code = 0xfffd
    if (code < 0x80) bytes.push(code)
    else if (code < 0x800) bytes.push(0xc0 | code >> 6, 0x80 | code & 63)
    else if (code < 0x10000) bytes.push(0xe0 | code >> 12, 0x80 | code >> 6 & 63, 0x80 | code & 63)
    else bytes.push(0xf0 | code >> 18, 0x80 | code >> 12 & 63, 0x80 | code >> 6 & 63, 0x80 | code & 63)
  }
  return new Uint8Array(bytes)
}
