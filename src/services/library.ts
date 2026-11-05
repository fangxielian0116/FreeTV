import type { CatalogItem, DramaDetail } from '@/domain/catalog'
import { itemKey } from '@/domain/catalog'
import type { WatchProgress } from '@/domain/playback'
import { readLocal, writeLocal } from './storage'
interface Library { favorites: CatalogItem[]; progress: WatchProgress[] }
const KEY = 'freetv:v3:library'
function validItem(item?: CatalogItem): item is CatalogItem { return !!item && typeof item.sourceId === 'string' && !!item.sourceId && typeof item.id === 'string' && !!item.id && typeof item.title === 'string' }
function validProgress(progress?: WatchProgress): progress is WatchProgress { return !!progress && validItem(progress.item) && progress.item.sourceId === progress.sourceId && progress.item.id === progress.vodId && Number.isFinite(progress.position) && progress.position >= 0 && Number.isFinite(progress.updatedAt) }
function load(): Library { const data = readLocal<Library>(KEY); return { favorites: Array.isArray(data?.favorites) ? data.favorites.filter(validItem) : [], progress: Array.isArray(data?.progress) ? data.progress.filter(validProgress) : [] } }
export const library = {
  favorites: () => load().favorites,
  isFavorite: (item: CatalogItem) => load().favorites.some(x => itemKey(x) === itemKey(item)),
  toggleFavorite(item: CatalogItem) { const data = load(), key = itemKey(item), exists = data.favorites.some(x => itemKey(x) === key); data.favorites = exists ? data.favorites.filter(x => itemKey(x) !== key) : [item, ...data.favorites]; writeLocal(KEY, data); return !exists },
  progress: () => load().progress.sort((a, b) => b.updatedAt - a.updatedAt),
  saveProgress(progress: WatchProgress) {
    if (!validProgress(progress)) return
    const data = load(); data.progress = [progress, ...data.progress.filter(x => !(x.sourceId === progress.sourceId && x.vodId === progress.vodId))].slice(0, 300); writeLocal(KEY, data)
  },
  remove(item: CatalogItem) { const data = load(), key = itemKey(item); data.favorites = data.favorites.filter(x => itemKey(x) !== key); data.progress = data.progress.filter(x => itemKey({ sourceId: x.sourceId, id: x.vodId }) !== key); writeLocal(KEY, data) },
  clear() { writeLocal(KEY, { favorites: [], progress: [] }) },
}
export const catalogCache = {
  get<T>(key: string): T | undefined { return readLocal<{ value: T; at: number }>(`freetv:v3:catalog:${key}`)?.value },
  put<T>(key: string, value: T) { writeLocal(`freetv:v3:catalog:${key}`, { value, at: Date.now() }) },
  detail(sourceId: string, id: string) { return this.get<DramaDetail>(`detail:${sourceId}:${id}`) },
  saveDetail(detail: DramaDetail) { this.put(`detail:${itemKey(detail)}`, detail) },
}
