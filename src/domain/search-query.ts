// H5 decodes navigation parameters; the Android service runtime can leave them encoded.
// Quoting the value lets us distinguish the two without decoding literal percent text twice.
export const searchUrl = (keyword: string) => `/pages/search/search?q=${encodeURIComponent(JSON.stringify(keyword.trim()))}`
export function readSearchQuery(query: Record<string, unknown> = {}) {
  if (typeof query.q === 'string') {
    for (const encoded of [false, true]) {
      try { const value = JSON.parse(encoded ? decodeURIComponent(query.q) : query.q); if (typeof value === 'string') return value } catch { /* try the other runtime representation */ }
    }
    return ''
  }
  const legacy = String(query.keyword || '')
  try { return decodeURIComponent(legacy) } catch { return legacy }
}
