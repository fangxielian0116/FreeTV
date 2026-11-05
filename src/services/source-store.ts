import { reactive } from 'vue'
import type { SourceDefinition } from '@/domain/catalog'
import { BUILTIN_SOURCES, DEFAULT_SOURCE, SOURCE_PROXY, SOURCE_UPSTREAM, normalizeApi } from '@/domain/sources'
import { extractSourceFeed, sha256 } from '@/domain/config-feed'
import { rankSources, recordObservation, type SourceObservation } from '@/domain/ranking'
import { readLocal, writeLocal } from './storage'
import { requestText } from './http'
interface Snapshot { sources: SourceDefinition[]; hash: string; checksum: string; etag: string; version: string; at: number }
interface Preferences { currentId: string; mode: 'auto' | 'fixed'; seededAt: number }
const PREFIX = 'freetv:v3:'
function valid(snapshot?: Snapshot): snapshot is Snapshot {
  return !!snapshot && Array.isArray(snapshot.sources) && snapshot.sources.length > 0 && snapshot.sources.length <= 128 && new Set(snapshot.sources.map(x => x.id)).size === snapshot.sources.length && snapshot.sources.every(x => { try { return typeof x.id === 'string' && !!x.id && typeof x.name === 'string' && Array.isArray(x.aliases) && Number.isFinite(x.prior) && x.prior >= 0 && x.prior <= 1 && !!normalizeApi(x.api) } catch { return false } }) && snapshot.checksum === sha256(JSON.stringify(snapshot.sources))
}
function loadSnapshot() {
  const active = readLocal<string>(`${PREFIX}config:active`) === 'B' ? 'B' : 'A'
  for (const slot of [active, active === 'A' ? 'B' : 'A']) { const snapshot = readLocal<Snapshot>(`${PREFIX}config:${slot}`); if (valid(snapshot)) return snapshot }
  return { sources: BUILTIN_SOURCES.map(x => ({ ...x, aliases: [...x.aliases] })), hash: '', checksum: '', etag: '', version: '内置', at: 0 }
}
const snapshot = loadSnapshot(), saved = readLocal<Preferences>(`${PREFIX}preferences`)
export const sourceState = reactive({
  sources: snapshot.sources, currentId: saved?.currentId || DEFAULT_SOURCE, mode: saved?.mode === 'fixed' ? 'fixed' as const : 'auto' as const,
  seededAt: saved?.seededAt || Date.now(), observations: readLocal<SourceObservation[]>(`${PREFIX}observations`) || [],
  syncing: false, syncAt: readLocal<number>(`${PREFIX}sync:at`) || 0, syncMessage: readLocal<string>(`${PREFIX}sync:message`) || '尚未检查', version: snapshot.version,
  online: true,
})
const cooling = new Map<string, number>()
function preferences() { writeLocal(`${PREFIX}preferences`, { currentId: sourceState.currentId, mode: sourceState.mode, seededAt: sourceState.seededAt }) }
export function sourceById(id: string) { return sourceState.sources.find(x => x.id === id) || BUILTIN_SOURCES.find(x => x.id === id) }
export function currentSource() { return sourceById(sourceState.currentId) || sourceById(DEFAULT_SOURCE)! }
export function selectSource(id: string, mode = sourceState.mode) { const source = sourceById(id); if (!source) throw new Error('片库配置已不可用'); sourceState.currentId = id; sourceState.mode = mode; preferences() }
export function setSourceMode(mode: 'auto' | 'fixed') { sourceState.mode = mode; preferences() }
export function rankings() { return rankSources(sourceState.sources, sourceState.observations, Date.now(), sourceState.seededAt) }
export function candidates(excluded: Set<string>) { return rankings().map(x => x.source).filter(x => !excluded.has(x.id) && (cooling.get(x.id) || 0) <= Date.now()) }
export function coolSource(id: string, ms = 60000) { cooling.set(id, Date.now() + ms) }
export function observe(id: string, sourceId: string, reward: number, reason: string, weight = 1) {
  if (!sourceState.online) return
  sourceState.observations = recordObservation(sourceState.observations, { id, sourceId, reward, weight, reason, at: Date.now() }); writeLocal(`${PREFIX}observations`, sourceState.observations)
}
export function initializeSources() {
  preferences()
  if (typeof uni !== 'undefined') {
    uni.getNetworkType({ success: result => { sourceState.online = result.networkType !== 'none' } })
    uni.onNetworkStatusChange(result => { sourceState.online = result.isConnected })
  }
}
let syncing: Promise<void> | undefined
export function syncSources() {
  if (syncing) return syncing
  syncing = (async () => {
    sourceState.syncing = true
    try {
      let response: Awaited<ReturnType<typeof requestText>> | undefined, lastError: unknown
      for (const url of [SOURCE_UPSTREAM, SOURCE_PROXY + SOURCE_UPSTREAM]) {
        try { const result = await requestText(url, { timeout: 8000, headers: snapshot.etag ? { 'If-None-Match': snapshot.etag } : {}, maxBytes: 2 * 1024 * 1024 }); if (result.status !== 200 && result.status !== 304) throw new Error(`配置请求失败（${result.status}）`); response = result; break } catch (error) { lastError = error }
      }
      if (!response) throw lastError || new Error('配置请求失败')
      if (response.status === 304 || sha256(response.text) === snapshot.hash) sourceState.syncMessage = '已是最新配置'
      else {
        const sources = extractSourceFeed(response.text, sourceState.sources)
        // Preserve identities referenced by history; removed entries cannot be chosen automatically.
        for (const old of sourceState.sources) if (!sources.some(x => x.id === old.id)) sources.push({ ...old, enabled: false })
        const next: Snapshot = { sources, hash: sha256(response.text), checksum: sha256(JSON.stringify(sources)), etag: response.headers.etag || '', version: /@version\s+([^\s]+)/.exec(response.text)?.[1] || '更新配置', at: Date.now() }
        if (!valid(next)) throw new Error('配置校验失败')
        const slot = readLocal(`${PREFIX}config:active`) === 'B' ? 'A' : 'B'; writeLocal(`${PREFIX}config:${slot}`, next)
        if (!valid(readLocal(`${PREFIX}config:${slot}`))) throw new Error('配置保存校验失败')
        writeLocal(`${PREFIX}config:active`, slot); Object.assign(snapshot, next); sourceState.sources = sources; sourceState.version = next.version; sourceState.syncMessage = '配置更新成功'
      }
    } catch { sourceState.syncMessage = '更新暂不可用，继续使用已有配置' }
    finally { sourceState.syncAt = Date.now(); writeLocal(`${PREFIX}sync:at`, sourceState.syncAt); writeLocal(`${PREFIX}sync:message`, sourceState.syncMessage); sourceState.syncing = false }
  })().finally(() => { syncing = undefined })
  return syncing
}
