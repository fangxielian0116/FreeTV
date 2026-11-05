import type { CatalogItem, DramaDetail, Episode, SourceDefinition } from '@/domain/catalog'
import type { PlayRequest } from '@/platform/player'
import {TV_BUILD} from '@/platform/target'
let serial = 0
export function playRequest(source: SourceDefinition, detail: DramaDetail, episode: Episode, position = 0): PlayRequest {
  const { routes: _routes, ...item } = detail
  return { ...(TV_BUILD?{uiMode:'tv' as const}:{}), sessionId: `play-${Date.now()}-${++serial}`, source: { ...source }, detail, episode, position, progress: { sourceId: source.id, vodId: detail.id, routeId: episode.routeId, episodeKey: episode.key, episodeLabel: episode.label, item: item as CatalogItem, position, duration: 0, updatedAt: Date.now(), ended: false } }
}
