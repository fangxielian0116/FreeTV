import type { CatalogItem } from '@/domain/catalog'
import { itemKey } from '@/domain/catalog'
import { readLocal, writeLocal } from './storage'
interface Mapping { refs: Record<string, string>; aliases: string[]; at: number }
const KEY = 'freetv:v3:mappings'
const identity = (item: CatalogItem) => item.doubanId ? `douban:${item.doubanId}` : itemKey(item)
export const mappings = {
  get(item: CatalogItem): Mapping | undefined { const data = readLocal<Record<string, Mapping>>(KEY) || {}; return data[identity(item)] || data[itemKey(item)] },
  learn(original: CatalogItem, candidate: CatalogItem) {
    const data = readLocal<Record<string, Mapping>>(KEY) || {}, old = this.get(original)
    const mapping: Mapping = { refs: { ...old?.refs, [original.sourceId]: original.id, [candidate.sourceId]: candidate.id }, aliases: [...new Set([...(old?.aliases || []), original.title, ...original.aliases, candidate.title, ...candidate.aliases])].slice(0, 20), at: Date.now() }
    data[identity(original)] = mapping; data[itemKey(original)] = mapping; data[identity(candidate)] = mapping; data[itemKey(candidate)] = mapping
    writeLocal(KEY, Object.fromEntries(Object.entries(data).sort((a, b) => b[1].at - a[1].at).slice(0, 1000)))
  },
}
