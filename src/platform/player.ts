import type { DramaDetail, Episode, SourceDefinition } from '@/domain/catalog'
import type { PlaybackEvent, ProbeResult, WatchProgress } from '@/domain/playback'
// #ifdef APP-PLUS
import { connectPlayer, playerCommand, pendingProgress, nativeVersion } from '@/uni_modules/freetv-player'
// #endif
export interface PlayRequest { sessionId: string; source: SourceDefinition; detail: DramaDetail; episode: Episode; position: number; progress: WatchProgress; paused?: boolean; uiMode?: 'tv' }
type Listener = (event: PlaybackEvent) => void
const listeners = new Set<Listener>(), pending = new Map<string, { resolve(value: any): void; reject(error: Error): void }>()
let connected = false, counter = 0
function receive(raw: string) {
  try {
    const message = JSON.parse(raw)
    if (message.type === 'response') { const task = pending.get(message.id); if (!task) return; pending.delete(message.id); message.error ? task.reject(new Error(message.error)) : task.resolve(message.value) }
    else if (message.type === 'event') for (const listener of listeners) listener(message.value)
  } catch { /* A malformed bridge message must not change playback. */ }
}
function connect() {
  if (connected) return
  // #ifdef APP-PLUS
  connectPlayer(receive); connected = true
  // #endif
}
export function hasNativePlayer() {
  // #ifdef APP-PLUS
  try { return nativeVersion() === '0.2.0' } catch { return false }
  // #endif
  // #ifndef APP-PLUS
  return false
  // #endif
}
function rpc<T>(command: string, data: unknown, timeout = 7000, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) return Promise.reject(new Error('请求已取消'))
  if (!hasNativePlayer()) return Promise.reject(new Error('请安装包含原生播放器的 FreeTV Android 安装包'))
  connect(); const id = `rpc-${Date.now()}-${++counter}`
  return new Promise<T>((resolve, reject) => {
    const clean = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); pending.delete(id) }
    const cancel = () => {
      // #ifdef APP-PLUS
      playerCommand(JSON.stringify({ command: 'cancelProbe', id: '', data: {} }))
      // #endif
    }
    const abort = () => { clean(); cancel(); reject(new Error('请求已取消')) }
    const timer = setTimeout(() => { clean(); if (command === 'probe') cancel(); reject(new Error('播放器请求超时')) }, Math.max(1, timeout))
    pending.set(id, { resolve(value) { clean(); resolve(value) }, reject(error) { clean(); reject(error) } })
    signal?.addEventListener('abort', abort, { once: true })
    // #ifdef APP-PLUS
    playerCommand(JSON.stringify({ command, id, data }))
    // #endif
  })
}
export const player = {
  listen(listener: Listener) { connect(); listeners.add(listener); return () => listeners.delete(listener) },
  open(request: PlayRequest) { return rpc<boolean>('open', request) },
  probe(request: PlayRequest, deadline: number, excludeUrl: string, signal?: AbortSignal, minNetworkMultiple = 2) { return rpc<ProbeResult>('probe', { request, deadline, excludeUrl, minNetworkMultiple }, deadline - Date.now(), signal) },
  commit(token: string, position: number, deadline: number) { return rpc<boolean>('commit', { token, position, deadline }, Math.min(5500, Math.max(1, deadline - Date.now()))) },
  rollback() { return rpc<boolean>('rollback', {}) },
  cancelProbe() { if (hasNativePlayer()) void rpc('cancelProbe', {}).catch(() => {}) },
  pause() { if (hasNativePlayer()) void rpc('pause', {}).catch(() => {}) },
  close() { if (hasNativePlayer()) void rpc('close', {}).catch(() => {}) },
  acknowledgeProgress(progress: WatchProgress) { if (hasNativePlayer()) void rpc('ackProgress', { sourceId: progress.sourceId, vodId: progress.vodId, updatedAt: progress.updatedAt }).catch(() => {}) },
  clearPending() { if (hasNativePlayer()) void rpc('clearPending', {}).catch(() => {}) },
  readPending(): WatchProgress | undefined {
    // #ifdef APP-PLUS
    try { const raw = pendingProgress(); return raw ? JSON.parse(raw) : undefined } catch { return undefined }
    // #endif
    // #ifndef APP-PLUS
    return undefined
    // #endif
  },
}
