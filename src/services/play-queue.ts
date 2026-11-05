import type { DramaDetail, Episode, SourceDefinition } from '@/domain/catalog'
export interface PlayQueue { source: SourceDefinition; detail: DramaDetail; episode: Episode; position?: number }
let current: PlayQueue | undefined
export const playQueue = { get: () => current, set: (queue: PlayQueue) => { current = queue }, clear: () => { current = undefined } }
