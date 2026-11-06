import { pinyin } from 'pinyin-pro'
import { normalizeTitle } from './matching'

export interface TitleSuggestion {
  id: string; title: string; type: 'movie' | 'tv'; rank: number; seenAt: number
}
export interface IndexedTitle extends TitleSuggestion { normalized: string; spelling: string; initials: string }
export const TITLE_TTL = 90 * 86400000
export const TITLE_LIMIT = 10000
export const TITLE_PAGE_SIZE = 100
export const TITLE_FEEDS: readonly {type:'movie'|'tv';tag:string}[] = [
  { type: 'movie', tag: '热门' }, { type: 'tv', tag: '热门' }, { type: 'tv', tag: '国产剧' },
  { type: 'movie', tag: '最新' }, ...['美剧','英剧','韩剧','日剧','港剧','日本动画','综艺','纪录片'].map(tag => ({type: 'tv' as const, tag})),
]

export function indexTitle(row: TitleSuggestion): IndexedTitle {
  const normalized = normalizeTitle(row.title)
  const syllables = pinyin(normalized, { toneType: 'none', type: 'array' })
  return { ...row, normalized, spelling: syllables.join('').replace(/\s/g, ''), initials: syllables.map(value => value[0] || '').join('') }
}
export function parseTitleFeed(text: string, type: 'movie' | 'tv', seenAt: number, offset = 0): TitleSuggestion[] {
  const data = JSON.parse(text)
  if (!Array.isArray(data?.subjects) || (!data.subjects.length && !offset)) throw new Error('热门片名暂未返回有效内容')
  if (!data.subjects.length) return []
  const rows: TitleSuggestion[] = []
  for (const [rank, row] of data.subjects.slice(0, TITLE_PAGE_SIZE).entries()) {
    if (!row || !/^\d+$/.test(String(row.id)) || typeof row.title !== 'string') continue
    const title = row.title.trim()
    if (!title || title.length > 160 || /[<>\u0000-\u001f]/.test(title)) continue
    rows.push({ id: String(row.id), title, type, rank:offset+rank, seenAt })
  }
  if (!rows.length) throw new Error('热门片名格式暂不可用')
  return rows
}
export function mergeTitles(old: TitleSuggestion[], incoming: TitleSuggestion[], now: number): TitleSuggestion[] {
  const rows = new Map(old.filter(row => row.seenAt >= now - TITLE_TTL).map(row => [row.id, row]))
  for (const row of incoming) {
    const previous = rows.get(row.id)
    rows.set(row.id, { ...row, rank: previous?.seenAt === row.seenAt ? Math.min(previous.rank, row.rank) : row.rank })
  }
  return [...rows.values()].sort((a,b) => b.seenAt-a.seenAt || a.rank-b.rank || a.id.localeCompare(b.id)).slice(0, TITLE_LIMIT)
}
export function suggestTitles(rows: IndexedTitle[], input: string, limit = 8): TitleSuggestion[] {
  const query = normalizeTitle(input), matches: {row: IndexedTitle; score: number}[] = []
  for (const row of rows) {
    let score = 0
    if (!query) score = 1
    else if (row.normalized === query) score = 6
    else if (row.normalized.startsWith(query)) score = 5
    else if (row.initials === query || row.spelling === query) score = 4
    else if (row.initials.startsWith(query) || row.spelling.startsWith(query)) score = 3
    else if (row.normalized.includes(query)) score = 2
    if (score) matches.push({row,score})
  }
  const seen = new Set<string>()
  return matches.sort((a,b) => b.score-a.score || a.row.rank-b.row.rank || b.row.seenAt-a.row.seenAt)
    .filter(({row}) => { if (seen.has(row.normalized)) return false; seen.add(row.normalized); return true })
    .slice(0, limit).map(({row}) => row)
}
