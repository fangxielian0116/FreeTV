import { parseHttpUrl } from './http-url'
export type MediaKind = 'movie' | 'series' | 'variety' | 'anime' | 'other'
export interface Category { id: string; name: string; parentId?: string; kind: MediaKind }
export interface SourceDefinition { id: string; name: string; api: string; aliases: string[]; prior: number; enabled: boolean }
export interface CatalogItem {
  sourceId: string; id: string; title: string; aliases: string[]; poster: string; year: string
  kind: MediaKind; categories: Category[]; remarks: string; updatedAt: string
  doubanId?: string; cast: string[]; directors: string[]; synopsis: string
  areas?: string[]
}
export interface Episode { key: string; label: string; url: string; routeId: string; index: number }
export interface PlayRoute { id: string; name: string; episodes: Episode[] }
export interface DramaDetail extends CatalogItem { routes: PlayRoute[] }
export interface CatalogPage { items: CatalogItem[]; page: number; next: number | null; total: number }
export interface MediaRef { sourceId: string; vodId: string; routeId: string; episodeKey: string }
export interface SourceAdapter {
  categories(signal?: AbortSignal): Promise<Category[]>
  list(options: { page?: number; category?: string; signal?: AbortSignal }): Promise<CatalogPage>
  search(keyword: string, options?: { page?: number; signal?: AbortSignal }): Promise<CatalogPage>
  detail(id: string, signal?: AbortSignal): Promise<DramaDetail>
  resolve(detail: DramaDetail, episode: Episode): { url: string; headers: Record<string, string> }
}
export const itemKey = (item: Pick<CatalogItem, 'sourceId' | 'id'>) => `${item.sourceId}:${item.id}`
export const mediaKey = (ref: MediaRef) => [ref.sourceId, ref.vodId, ref.routeId, ref.episodeKey].map(encodeURIComponent).join(':')
export function kindOf(name: string): MediaKind {
  if (/综艺|綜藝/.test(name)) return 'variety'
  if (/动漫|動畫|动画|動漫|番剧/.test(name)) return 'anime'
  if (/电视剧|電視劇|国产剧|大陆剧|欧美剧|日韩剧|港澳剧|香港剧|台湾剧|韩国剧|日本剧|泰国剧|海外剧|短剧|连续剧|美剧|韩剧|日剧/.test(name)) return 'series'
  if (/电影|電影|剧情|喜剧|动作|爱情|悬疑|科幻|恐怖|惊悚|战争|纪录|犯罪|冒险|奇幻|灾难/.test(name)) return 'movie'
  return 'other'
}
export function isPublicMediaUrl(value: string) {
  try { parseHttpUrl(value); return true } catch { return false }
}
export function directRoutes(detail: DramaDetail) {
  return detail.routes.filter(route => route.episodes.length).sort((a, b) => Number(/m3u8/i.test(b.id)) - Number(/m3u8/i.test(a.id)))
}
