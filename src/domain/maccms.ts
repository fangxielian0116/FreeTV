import { parseDocument, DomUtils } from 'htmlparser2'
import { isPublicMediaUrl, kindOf, type CatalogItem, type Category, type DramaDetail, type PlayRoute } from './catalog'
export const plainText = (value: unknown) => DomUtils.textContent(parseDocument(String(value ?? ''))).replace(/\s+/g, ' ').trim()
const splitNames = (value: unknown) => plainText(value).split(/[,，/、|]/).map(x => x.trim()).filter(Boolean)
export function parsePayload(input: string | object): { list: Record<string, any>[]; class?: Record<string, any>[]; page?: number; pagecount?: number; total?: number; code?: number; msg?: string } {
  if (typeof input !== 'string') return input as ReturnType<typeof parsePayload>
  const text = input.replace(/^\uFEFF/, '').trim()
  if (!text.startsWith('<')) return JSON.parse(text)
  const dom = parseDocument(text, { xmlMode: true, decodeEntities: true })
  const nodes = (name: string) => DomUtils.findAll(el => el.name === name, dom.children)
  const field = (node: any, name: string) => DomUtils.textContent(DomUtils.findOne(el => el.name === name, node.children) || { children: [] } as any).trim()
  const listNode = nodes('list')[0]
  return {
    page: Number(listNode?.attribs.page || 1), pagecount: Number(listNode?.attribs.pagecount || 1), total: Number(listNode?.attribs.recordcount || nodes('video').length),
    class: nodes('ty').map(el => ({ type_id: el.attribs.id, type_name: DomUtils.textContent(el), type_pid: el.attribs.pid })),
    list: nodes('video').map(el => ({ vod_id: field(el, 'id'), vod_name: field(el, 'name'), type_name: field(el, 'type'), type_id: field(el, 'tid'), vod_year: field(el, 'year'), vod_area: field(el, 'area'), vod_pic: field(el, 'pic'), vod_content: field(el, 'des'), vod_remarks: field(el, 'note'), vod_actor: field(el, 'actor'), vod_director: field(el, 'director'), vod_sub: field(el, 'sub'), vod_douban_id: field(el, 'douban_id'), vod_time: field(el, 'last'), vod_play_from: DomUtils.findAll(e => e.name === 'dd', el.children).map(e => e.attribs.flag || '').join('$$$'), vod_play_url: DomUtils.findAll(e => e.name === 'dd', el.children).map(e => DomUtils.textContent(e)).join('$$$') })),
  }
}
export function parseCategories(rows: Record<string, any>[] = []): Category[] {
  return rows.filter(x => x.type_id != null && !/伦理|情色|成人|福利|写真|里番/.test(x.type_name || '')).map(x => ({ id: String(x.type_id), name: plainText(x.type_name), parentId: x.type_pid && String(x.type_pid) !== '0' ? String(x.type_pid) : undefined, kind: kindOf(plainText(x.type_name)) }))
}
export function parseItem(sourceId: string, row: Record<string, any>): CatalogItem {
  const title = plainText(row.vod_name), categoryName = plainText(row.type_name)
  let poster = String(row.vod_pic || '').trim(); if (poster.startsWith('//')) poster = 'https:' + poster
  return { sourceId, id: String(row.vod_id ?? ''), areas: splitNames(row.vod_area), title, aliases: splitNames(row.vod_sub).filter(x => x.length > 1 && x !== title), poster: isPublicMediaUrl(poster) ? poster : '', year: String(row.vod_year || '').match(/(?:19|20)\d{2}/)?.[0] || '', kind: kindOf(categoryName), categories: categoryName ? [{ id: String(row.type_id || ''), name: categoryName, kind: kindOf(categoryName) }] : [], remarks: plainText(row.vod_remarks), updatedAt: String(row.vod_time || ''), doubanId: /^[1-9]\d+$/.test(String(row.vod_douban_id)) ? String(row.vod_douban_id) : undefined, cast: splitNames(row.vod_actor), directors: splitNames(row.vod_director), synopsis: plainText(row.vod_content || row.vod_blurb) }
}
export function parseDetail(sourceId: string, row: Record<string, any>): DramaDetail {
  const from = String(row.vod_play_from || '').split('$$$'), groups = String(row.vod_play_url || '').split('$$$')
  const used = new Map<string, number>()
  const routes: PlayRoute[] = groups.map((group, index) => {
    const name = from[index] || `线路${index + 1}`, occurrence = used.get(name) || 0; used.set(name, occurrence + 1)
    const id = occurrence ? `${name}:${occurrence}` : name
    const labels = new Map<string, number>()
    return { id, name, episodes: group.split('#').flatMap((entry, i) => {
      const split = entry.indexOf('$'), label = split < 0 ? `第${i + 1}集` : plainText(entry.slice(0, split)), url = (split < 0 ? entry : entry.slice(split + 1)).trim()
      if (!isPublicMediaUrl(url) || !/\.(?:m3u8|mp4|mkv|webm|mpd)(?:$|[?#])/i.test(url)) return []
      const count = labels.get(label) || 0; labels.set(label, count + 1)
      return [{ key: encodeURIComponent(label) + (count ? `~${count}` : ''), label, url, routeId: id, index: i }]
    }) }
  }).filter(route => route.episodes.length)
  return { ...parseItem(sourceId, row), routes }
}
