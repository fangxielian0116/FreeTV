import type { SourceDefinition } from './catalog'
export interface SourceObservation { id: string; sourceId: string; reward: number; weight: number; reason: string; at: number }
export interface SourceRank { source: SourceDefinition; mean: number; count: number; index: number }
export const HALF_LIFE_MS = 7 * 86400000
export function recordObservation(rows: SourceObservation[], observation: SourceObservation) {
  if (!Number.isFinite(observation.reward) || !Number.isFinite(observation.weight) || observation.weight <= 0) return rows
  const safe = { ...observation, reward: Math.max(0, Math.min(1, observation.reward)), weight: Math.min(1, observation.weight) }
  return [...rows.filter(x => x.id !== safe.id), safe].sort((a, b) => b.at - a.at).slice(0, 2000)
}
export function rankSources(sources: SourceDefinition[], rows: SourceObservation[], now: number, seededAt: number): SourceRank[] {
  const decay = (at: number) => Math.pow(.5, Math.max(0, now - at) / HALF_LIFE_MS)
  const values = sources.filter(s => s.enabled).map(source => {
    let count = 2 * decay(seededAt), total = source.prior * count
    for (const row of rows) if (row.sourceId === source.id) { const weight = row.weight * decay(row.at); count += weight; total += weight * row.reward }
    return { source, count: Math.max(count, 1e-9), mean: count > 1e-9 ? total / count : source.prior }
  })
  const total = values.reduce((n, x) => n + x.count, 0)
  return values.map(x => ({ ...x, index: x.mean + .3 * Math.sqrt(Math.log(1 + total) / x.count) }))
    .sort((a, b) => b.index - a.index || sources.indexOf(a.source) - sources.indexOf(b.source))
}
