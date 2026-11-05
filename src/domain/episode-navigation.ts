import type {DramaDetail, Episode} from './catalog'
import type {PlaybackEvent} from './playback'

export function adjacentEpisode(detail: Pick<DramaDetail,'routes'>, current: Pick<Episode,'routeId'|'key'>, delta: number): Episode | undefined {
  const route = detail.routes.find(row => row.id === current.routeId)
  const index = route?.episodes.findIndex(row => row.key === current.key) ?? -1
  return index < 0 ? undefined : route?.episodes[index + delta]
}

/** Native completion snapshots may repeat until the next session opens or the page unloads. */
export class EpisodeCompletion {
  private completedSession = ''
  take(event: Pick<PlaybackEvent,'sessionId'|'state'>, activeSession: string): boolean {
    if (!activeSession || event.sessionId !== activeSession || event.state !== 'ended' || this.completedSession === activeSession) return false
    this.completedSession = activeSession
    return true
  }
}
