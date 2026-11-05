import type { CatalogItem, MediaRef } from './catalog'
export type PlaybackState = 'loading' | 'ready' | 'playing' | 'paused' | 'buffering' | 'ended' | 'error'
export interface WatchProgress extends MediaRef { item: CatalogItem; episodeLabel: string; position: number; duration: number; updatedAt: number; ended: boolean }
export interface PlaybackMetrics {
  effectiveSeconds: number; rebufferCount: number; rebufferMs: number; width: number; height: number
  networkMultiple?: number; bufferedSeconds: number; droppedFrames: number; finalUrl?: string; firstFrame?: boolean
}
export interface PlaybackEvent {
  sessionId: string; state: PlaybackState; position: number; duration: number; metrics: PlaybackMetrics
  action?: 'previous' | 'next' | 'episodes' | 'seek' | 'close' | 'retry'; message?: string; code?: string; online: boolean; at: number
}
export interface ProbeResult {
  status: 'ready' | 'failed' | 'unknown'; token?: string; sessionId?: string; elapsedMs: number; reason: string
  metrics?: PlaybackMetrics; position?: number; finalUrl?: string
}
export function resumePosition(position: number, duration: number, ended = false) {
  if (ended || !Number.isFinite(position) || position < 3) return 0
  if (duration > 0 && position >= duration - 1) return 0
  return position
}
export function is1080Class(width: number, height: number) { return Math.max(width, height) >= 1920 }
export function playbackReward(event: PlaybackEvent): number | undefined {
  if (!event.online) return undefined
  if (event.state === 'error') return 0
  if (event.metrics.rebufferCount >= 2 || event.metrics.rebufferMs >= 15000) return .3
  if (event.metrics.effectiveSeconds < 120) return undefined
  if (!event.metrics.width || !event.metrics.height) return .9
  return is1080Class(event.metrics.width, event.metrics.height) ? 1 : .8
}
export class StallTracker {
  private waitingAt?: number
  private stalls: { at: number; ms: number }[] = []
  update(state: PlaybackState, now: number, eligible: boolean) {
    let completed = false
    if (!eligible) { this.waitingAt = undefined; return false }
    if (state === 'buffering') this.waitingAt ??= now
    else if (this.waitingAt !== undefined) {
      const ms = now - this.waitingAt
      if (ms >= 3000) { this.stalls.push({ at: now, ms }); completed = true }
      this.waitingAt = undefined
    }
    this.stalls = this.stalls.filter(x => now - x.at <= 300000)
    const current = this.waitingAt === undefined ? 0 : now - this.waitingAt
    return current >= 15000 || current >= 3000 && this.stalls.length >= 1 || completed && this.stalls.length >= 2
  }
  reset() { this.waitingAt = undefined; this.stalls = [] }
}
