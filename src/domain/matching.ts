import type { CatalogItem, DramaDetail, Episode } from './catalog'
import { Converter } from 'opencc-js'
export type MatchResult = { level: 'episode'; detail: DramaDetail; episode: Episode; reason: string } | { level: 'work'; detail: DramaDetail; reason: string } | { level: 'unknown'; reason: string }
let simplify: ((value: string) => string) | undefined, traditionalize: ((value: string) => string) | undefined
const toSimple = (value: string) => (simplify ||= Converter({from:'t',to:'cn'}))(value)
const toTraditional = (value: string) => (traditionalize ||= Converter({from:'cn',to:'t'}))(value)
export function chineseNumber(value: string): number {
  if (/^\d+$/.test(value)) return Number(value)
  const digits: Record<string, number> = { 零:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9 }
  if (value.includes('十')) { const [a, b] = value.split('十'); return (digits[a] || 1) * 10 + (digits[b] || 0) }
  return digits[value] || 0
}
export function normalizeTitle(value: string) {
  return toSimple(value.normalize('NFKC')).toLowerCase()
    .replace(/[\s·・:：,，。.!！?？\-_—（）()【】\[\]《》'"“”]/g, '')
    .replace(/第([一二三四五六七八九十两\d]+)(季|部)/g, (_, n: string, unit: string) => `第${chineseNumber(n)}${unit}`)
}
function season(title: string) { const match = normalizeTitle(title).match(/第(\d+)(?:季|部)|(?:season|s)(\d{1,2})(?:$|e\d)/); return match ? Number(match[1] || match[2]) : undefined }
const overlap = (a: string[], b: string[]) => a.map(normalizeTitle).filter(x => x && b.map(normalizeTitle).includes(x)).length
export function sameWork(a: CatalogItem, b: CatalogItem, learnedAliases: string[] = []) {
  if (a.kind !== 'other' && b.kind !== 'other' && a.kind !== b.kind) return false
  const sa = season(a.title), sb = season(b.title)
  if (sa !== undefined && sb !== undefined && sa !== sb) return false
  if (a.year && b.year && a.year !== b.year) return false
  if (a.doubanId && b.doubanId) return a.doubanId === b.doubanId
  if ((sa !== undefined || sb !== undefined) && sa !== sb) return false
  const names = [a.title, ...a.aliases, ...learnedAliases].map(normalizeTitle)
  const exact = [b.title, ...b.aliases].some(name => names.includes(normalizeTitle(name)))
  return exact && ((!!a.year && a.year === b.year) || overlap(a.cast, b.cast) >= 2 || overlap(a.directors, b.directors) >= 1)
}
export interface EpisodeIdentity { ordinal?: number; date?: string; part: string; edition: string; language: string }
export function episodeIdentity(label: string): EpisodeIdentity {
  const text = normalizeTitle(label)
  const date = text.match(/(20\d{2})[年/.-]?(\d{2})[月/.-]?(\d{2})/)?.slice(1).join('')
  const number = text.match(/第([零一二三四五六七八九十两\d]+)(?:集|期|话)/) || (!date ? text.match(/^([零一二三四五六七八九十两\d]+)(?:集|话)?$/) : null)
  const editions = ['纯享','加更','花絮','彩蛋','预告','先导','回顾','特辑','直播','精编','速看','幕后','衍生','直拍','陪看']
  const edition = editions.find(x => text.includes(x)) || '正片'
  const part = text.match(/(?:\d|期|集|话|正片)([上中下])(?:集|部|篇|期|纯享|加更|$)/)?.[1] || text.match(/([上中下])(?:集|部|篇)(?:$|纯享|加更)/)?.[1] || text.match(/^([上中下])$/)?.[1] || ''
  return { ordinal: number ? chineseNumber(number[1]) : undefined, date, part, edition, language: /粤语|粵語/.test(text) ? '粤语' : /国语|普通话/.test(text) ? '国语' : '' }
}
export function isMainEpisode(episode: Episode) { return episodeIdentity(episode.label).edition === '正片' }
export function matchEpisode(original: Episode, detail: DramaDetail, kind: CatalogItem['kind']): Episode | undefined {
  const a = episodeIdentity(original.label)
  const preferred = detail.routes.some(r => /m3u8/i.test(r.id)) ? detail.routes.filter(r => /m3u8/i.test(r.id)) : detail.routes
  const candidates = preferred.flatMap(r => r.episodes).filter(e => {
    const b = episodeIdentity(e.label)
    if (a.edition !== b.edition || a.part !== b.part || (a.language && b.language && a.language !== b.language)) return false
    if (a.ordinal !== undefined && b.ordinal !== undefined) return a.ordinal === b.ordinal
    if (a.date && b.date) return a.date === b.date
    if (kind === 'movie' && a.edition === '正片') return b.ordinal === undefined && !b.part
    return normalizeTitle(original.label) === normalizeTitle(e.label)
  })
  return candidates.length === 1 ? candidates[0] : undefined
}
export function searchTerms(item: CatalogItem, aliases: string[] = []) {
  const simple = toSimple(item.title.normalize('NFKC'))
  const core = simple.replace(/第[零一二三四五六七八九十两\d]+[季部]|\b(?:season|s)\s*\d{1,2}\b/gi, '').trim()
  const alternate = simple === item.title ? toTraditional(item.title) : simple
  return [...new Set([item.title, ...aliases.filter(x=>x.length>1), ...item.aliases.filter(x => x.length > 1), core, alternate].filter(Boolean))].slice(0, 3)
}
