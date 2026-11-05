import type { CatalogItem, Category, MediaKind } from './catalog'
import { productionRegion, type ProductionRegion } from './production-region'
import { chinaYear } from './date-time'

type ContentKind = Exclude<MediaKind, 'other'>
export type HomeKind = 'all' | 'movie' | 'series-domestic' | 'series-overseas' | 'variety-domestic' | 'variety-overseas' | 'anime-domestic' | 'anime-overseas'
export const HOME_CATEGORIES: { id: HomeKind; name: string; kind?: ContentKind; region?: ProductionRegion }[] = [
  { id: 'all', name: '全部' }, { id: 'movie', name: '电影', kind: 'movie' },
  { id: 'series-domestic', name: '国产剧', kind: 'series', region: 'domestic' },
  { id: 'series-overseas', name: '海外剧', kind: 'series', region: 'overseas' },
  { id: 'variety-domestic', name: '国产综艺', kind: 'variety', region: 'domestic' },
  { id: 'variety-overseas', name: '海外综艺', kind: 'variety', region: 'overseas' },
  { id: 'anime-domestic', name: '国漫', kind: 'anime', region: 'domestic' },
  { id: 'anime-overseas', name: '海外动漫', kind: 'anime', region: 'overseas' },
]
export const savedHomeCategory = (value: unknown): HomeKind => HOME_CATEGORIES.find(row => row.id === value)?.id || 'all'
export function homeClassifier(rows: Category[]) {
  const byId = new Map(rows.map(row => [row.id, row])), kinds = new Map<string, MediaKind>(), regions = new Map<string, ProductionRegion>()
  for (const initial of rows) {
    let row = initial
    const seen = new Set<string>()
    const names: string[] = [], ancestry: Category[] = []
    while (!seen.has(row.id)) {
      seen.add(row.id)
      names.push(row.name); ancestry.push(row)
      if (!row.parentId) break
      const parent = byId.get(row.parentId); if (!parent) break
      row = parent
    }
    kinds.set(initial.id, ancestry.find(category => category.kind !== 'other')?.kind || 'other')
    regions.set(initial.id, productionRegion(names))
  }
  return {
    ids: (kind: ContentKind) => rows.filter(row => kinds.get(row.id) === kind).map(row => row.id),
    kind: (item: CatalogItem) => item.kind !== 'other' ? item.kind : item.categories.map(category => kinds.get(category.id)).find(kind => kind && kind !== 'other') || 'other',
    region: (item: CatalogItem) => {
      const area = productionRegion(item.areas)
      if (area !== 'unknown') return area
      const direct = productionRegion(item.categories.map(category => category.name))
      return direct !== 'unknown' ? direct : item.categories.map(category => regions.get(category.id)).find(region => region && region !== 'unknown') || 'unknown'
    },
  }
}
export const homeCategoryIds = (rows: Category[], kind: ContentKind) => homeClassifier(rows).ids(kind)
export const homeCacheKey = (sourceId: string, kind: HomeKind, page = 1, year = chinaYear()) => `home:v3:${sourceId}:${kind}:${year}:${page}`
