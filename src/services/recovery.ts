import { directRoutes, type DramaDetail, type Episode, type SourceAdapter, type SourceDefinition } from '@/domain/catalog'
import { isMainEpisode, matchEpisode, sameWork, searchTerms, type MatchResult } from '@/domain/matching'
import type { ProbeResult } from '@/domain/playback'
import { AbortController } from '@/platform/cancellation'
import { RECOVERY_VERIFY_MS } from '@/domain/recovery-policy'

export interface RecoveryPlan { source: SourceDefinition; match: Exclude<MatchResult, { level: 'unknown' }>; probe: ProbeResult; deadline: number }
export interface RecoveryDependencies {
  adapter(source: SourceDefinition): SourceAdapter
  candidates(excluded: Set<string>): SourceDefinition[]
  known(item: DramaDetail): { refs: Record<string, string>; aliases: string[] } | undefined
  probe(source: SourceDefinition, detail: DramaDetail, episode: Episode, position: number, deadline: number, signal: AbortSignal): Promise<ProbeResult>
  discard(): void
  cool(sourceId: string): void
  now?(): number
}
export class RecoveryCoordinator {
  private controller?: AbortController
  private job?: Promise<RecoveryPlan | undefined>
  constructor(private deps: RecoveryDependencies) {}
  cancel() { this.controller?.abort(); this.controller = undefined; this.job = undefined; this.deps.discard() }
  prepare(original: DramaDetail, episode: Episode, position: number, expectedCurrent: () => boolean, missing = false) {
    if (this.job) return this.job
    const controller = new AbortController(); this.controller = controller
    const now = this.deps.now || Date.now, deadline = now() + RECOVERY_VERIFY_MS, timer = setTimeout(() => controller.abort(), RECOVERY_VERIFY_MS)
    const signal = controller.signal
    const valid = () => !signal.aborted && expectedCurrent() && now() < deadline
    this.job = (async () => {
      const tried = new Set([original.sourceId]), known = this.deps.known(original)
      for (let index = 0; index < 2 && valid(); index++) {
        const source = this.deps.candidates(tried)[0]; if (!source) return
        tried.add(source.id); const adapter = this.deps.adapter(source)
        try {
          let detail: DramaDetail | undefined
          const mappedId = known?.refs[source.id]
          if (mappedId) { const mapped = await adapter.detail(mappedId, signal); if (sameWork(original, mapped, known?.aliases)) detail = mapped }
          if (!detail && valid()) {
            const found = new Map<string, DramaDetail>()
            for (const term of searchTerms(original, known?.aliases)) {
              if (!valid()) return
              const page = await adapter.search(term, { signal })
              const matches = page.items.filter(item => sameWork(original, item, known?.aliases)).slice(0, 3)
              for (const item of matches) {
                if (!valid()) return
                const candidate = await adapter.detail(item.id, signal)
                if (sameWork(original, candidate, known?.aliases)) found.set(candidate.id, candidate)
              }
              if (found.size) break
            }
            if (found.size === 1) detail = [...found.values()][0]
          }
          if (!detail || !valid()) { this.deps.cool(source.id); continue }
          const matched = matchEpisode(episode, detail, original.kind)
          const main = (directRoutes(detail)[0]?.episodes || []).filter(isMainEpisode)
          const target = missing ? main[main.length - 1] : matched || main[0]; if (!target) continue
          if (target.url === episode.url) { this.deps.cool(source.id); continue }
          const probe = await this.deps.probe(source, detail, target, matched && !missing ? position : 0, deadline, signal)
          if (!valid() || probe.status !== 'ready') { this.deps.cool(source.id); this.deps.discard(); continue }
          const match: RecoveryPlan['match'] = matched && !missing ? { level: 'episode', detail, episode: matched, reason: '已确认同一作品和剧集' } : { level: 'work', detail, reason: '已确认同剧，请选择要继续的集数' }
          return { source, match, probe, deadline }
        } catch { if (!valid()) return; this.deps.discard(); this.deps.cool(source.id) }
      }
    })().finally(() => { clearTimeout(timer); if (this.controller === controller) { this.controller = undefined; this.job = undefined } })
    return this.job
  }
}
