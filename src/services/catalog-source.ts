import { kindOf, type CatalogItem, type CatalogPage, type Category, type DramaDetail, type SourceAdapter, type SourceDefinition } from '@/domain/catalog'
import { parseCategories, parseDetail, parseItem, parsePayload } from '@/domain/maccms'
import { normalizeApi } from '@/domain/sources'
import { requestText, RequestError } from './http'
import { parseHttpUrl, withQuery } from '@/domain/http-url'
import { HOME_CATEGORIES, homeClassifier, type HomeKind } from '@/domain/home'
import { chinaYear } from '@/domain/date-time'

interface CategoryBranch { id: string; items: CatalogItem[]; next: number | null; total: number }
interface CategoryListing { branches: CategoryBranch[]; pages: CatalogPage[]; seen: Set<string>; at: number }
const categoryTime = (item: CatalogItem) => /^\d+$/.test(item.updatedAt) ? Number(item.updatedAt) * (item.updatedAt.length <= 10 ? 1000 : 1) : Date.parse(item.updatedAt.replace(' ', 'T')) || 0
const newestFirst = (a: CatalogItem, b: CatalogItem) => categoryTime(b) - categoryTime(a) || (a.id < b.id ? 1 : a.id === b.id ? 0 : -1)
function checkCancelled(signal?: AbortSignal) { if (signal?.aborted) throw new RequestError('请求已取消', 'abort') }
async function parallelCategories<T>(ids: string[], read: (id: string) => Promise<T>, signal?: AbortSignal) {
  const values: T[] = new Array(ids.length); let cursor = 0
  await Promise.all(Array.from({length: Math.min(3, ids.length)}, async () => {
    while (cursor < ids.length) { checkCancelled(signal); const index = cursor++; values[index] = await read(ids[index]) }
  }))
  checkCancelled(signal); return values
}

export class MacCMSSource implements SourceAdapter {
  private taxonomy?: { rows: Category[]; at: number }
  private grouped = new Map<string, CategoryListing>()
  private recursiveParents = new Set<string>()
  constructor(readonly source: SourceDefinition, private transport = requestText) {}
  private async query(params: Record<string, string | number>, signal?: AbortSignal) {
    const response = await this.transport(withQuery(normalizeApi(this.source.api), params), { signal })
    if (response.status < 200 || response.status >= 300) throw new RequestError(`片库暂不可用（${response.status}）`, 'http', response.status)
    let payload: ReturnType<typeof parsePayload>
    try { payload = parsePayload(response.text) } catch { throw new RequestError('片库返回了无法识别的数据', 'format') }
    if (!payload || !Array.isArray(payload.list)) throw new RequestError('片库返回了无法识别的数据', 'format')
    return payload
  }
  async categories(signal?: AbortSignal) {
    checkCancelled(signal)
    if (this.taxonomy && Date.now() - this.taxonomy.at < 600000) return this.taxonomy.rows
    const rows = parseCategories((await this.query({ ac: 'list', pg: 1 }, signal)).class)
    if (this.taxonomy && JSON.stringify(this.taxonomy.rows) !== JSON.stringify(rows)) { this.grouped.clear(); this.recursiveParents.clear() }
    checkCancelled(signal); this.taxonomy = { rows, at: Date.now() }; return rows
  }
  async list(options: { page?: number; category?: string; signal?: AbortSignal } = {}) {
    const page = options.page || 1, id = options.category, signal = options.signal
    if (!id) return this.page({ ac: 'detail', pg: page }, signal)
    const categories = await this.categories(signal), descendants = new Set<string>(), pending = [id]
    while (pending.length) {
      const parent = pending.pop()!
      for (const child of categories) if (child.parentId === parent && child.id !== id && !descendants.has(child.id)) { descendants.add(child.id); pending.push(child.id) }
    }
    if (!descendants.size || this.recursiveParents.has(id)) return this.page({ ac: 'detail', pg: page, t: id }, signal)
    let listing = this.grouped.get(id)
    if (page === 1) {
      const own = await this.page({ ac: 'detail', pg: 1, t: id }, signal)
      // Some APIs include descendants; others match only the exact category ID.
      if (own.items.some(item => item.categories.some(category => descendants.has(category.id)))) { this.recursiveParents.add(id); return own }
      const children = await parallelCategories([...descendants], async child => ({ id: child, ...await this.page({ ac: 'detail', pg: 1, t: child }, signal) }), signal)
      listing = { branches: [{id, ...own}, ...children].map(branch => ({id: branch.id, items: [...branch.items].sort(newestFirst), next: branch.next, total: branch.total})), pages: [], seen: new Set(), at: Date.now() }
    }
    return this.mergeListing(id, listing, page, signal)
  }
  async home(kind: HomeKind, options: { page?: number; signal?: AbortSignal; year?: number } = {}) {
    const page = options.page || 1, year = options.year || chinaYear(), signal = options.signal
    const key = `home:${kind}:${year}`, params = {year: `${year - 1}-${year}`}
    const selected = HOME_CATEGORIES.find(category => category.id === kind)!
    // All uses the source's combined directory, not eight serial category loads.
    const [taxonomy, combined] = await Promise.all([
      this.categories(signal),
      kind === 'all' && page === 1 ? this.page({ac:'detail',pg:1,...params},signal) : Promise.resolve(undefined),
    ])
    const classifier = homeClassifier(taxonomy)
    const accept = (item: CatalogItem) => {
      if (Number(item.year) < year - 1 || Number(item.year) > year) return false
      const contentKind = classifier.kind(item)
      return contentKind !== 'other' && (!selected.kind || contentKind === selected.kind) && (!selected.region || classifier.region(item) === selected.region)
    }
    let listing = this.grouped.get(key)
    if (page === 1) {
      const ids = selected.kind ? classifier.ids(selected.kind) : ['']
      if (!ids.length) ids.push('')
      const children = await parallelCategories(ids, async id => ({id, ...(combined || await this.page({ac:'detail',pg:1,...(id ? {t:id} : {}),...params}, signal))}), signal)
      listing = {branches:children.map(branch=>({id:branch.id,items:branch.items.sort(newestFirst),next:branch.next,total:branch.total})),pages:[],seen:new Set(),at:Date.now()}
    }
    return this.mergeListing(key, listing, page, signal, params, accept)
  }
  private async mergeListing(key: string, listing: CategoryListing | undefined, page: number, signal?: AbortSignal, params: Record<string,string> = {}, accept: (item: CatalogItem) => boolean = () => true) {
    if (!listing || Date.now() - listing.at > 600000 || page > listing.pages.length + 1) throw new RequestError('分类列表已更新，请刷新后继续浏览', 'format')
    if (listing.pages[page - 1]) return listing.pages[page - 1]
    // Work on a copy: cancelling a request must not consume the next page.
    const branches = listing.branches.map(branch => ({...branch, items: [...branch.items]})), seen = new Set(listing.seen), items: CatalogItem[] = []
    let refills = 0
    while (items.length < 20) {
      checkCancelled(signal)
      const empty = branches.filter(branch => !branch.items.length && branch.next !== null)
      refills += empty.length
      if (refills > 16) {
        // A provider may ignore the year filter. Keep a resumable cursor instead
        // of scanning its whole catalogue or treating old backfills as new films.
        if (params.year) break
        throw new RequestError('片库分类分页异常，请稍后重试', 'format')
      }
      await parallelCategories(empty.map(branch => branch.id), async child => {
        const branch = branches.find(value => value.id === child)!, result = await this.page({ ac: 'detail', pg: branch.next!, ...(child ? {t:child} : {}), ...params }, signal)
        branch.items = [...result.items].sort(newestFirst); branch.next = result.next; branch.total = result.total
      }, signal)
      const available = branches.filter(branch => branch.items.length).sort((a,b) => newestFirst(a.items[0],b.items[0]))
      if (!available.length) { if (branches.some(branch => branch.next !== null)) continue; break }
      const item = available[0].items.shift()!
      if (!seen.has(item.id)) { seen.add(item.id); if (accept(item)) items.push(item) }
    }
    checkCancelled(signal)
    const result: CatalogPage = { items, page, next: branches.some(branch => branch.items.length || branch.next !== null) ? page + 1 : null, total: branches.reduce((sum,branch) => sum + branch.total,0) }
    this.grouped.delete(key); this.grouped.set(key, {branches, pages: [...listing.pages,result], seen, at: Date.now()})
    while (this.grouped.size > 8) this.grouped.delete(this.grouped.keys().next().value!)
    return result
  }
  async search(keyword: string, options: { page?: number; signal?: AbortSignal } = {}) {
    try { return await this.page({ ac: 'detail', wd: keyword, pg: options.page || 1 }, options.signal) }
    catch (error) {
      if (options.signal?.aborted || error instanceof RequestError && ['http', 'timeout', 'abort'].includes(error.code)) throw error
      // Some MacCMS sites publish a public suggest endpoint instead of keyword search.
      const url = withQuery(parseHttpUrl(this.source.api).origin + '/index.php/ajax/suggest', { mid: 1, wd: keyword })
      const response = await this.transport(url, { signal: options.signal }); if (response.status !== 200) throw error
      let rows: any[]; try { rows = JSON.parse(response.text).list } catch { throw error }
      if (!Array.isArray(rows) || !rows.length) return { items: [], page: 1, next: null, total: 0 }
      const ids = rows.slice(0, 20).map(row => String(row.id || '')).filter(id => /^[\w-]+$/.test(id))
      if (!ids.length) throw error
      return this.page({ ac: 'detail', ids: ids.join(',') }, options.signal)
    }
  }
  private async page(params: Record<string, string | number>, signal?: AbortSignal): Promise<CatalogPage> {
    const data = await this.query(params, signal)
    if (data.code !== undefined && Number(data.code) !== 1 && data.msg && !data.list.length) throw new RequestError(data.msg, 'format')
    const items = data.list.filter(row => row.vod_id != null && row.vod_name && !/伦理|情色|成人|福利|写真|里番/.test(row.type_name || '')).map(row => parseItem(this.source.id, row))
    const page = Math.max(1, Number(data.page || params.pg || 1)), count = Number(data.pagecount || 1)
    return { items, page, next: page < count ? page + 1 : null, total: Number(data.total || items.length) }
  }
  async detail(id: string, signal?: AbortSignal): Promise<DramaDetail> {
    const data = await this.query({ ac: 'detail', ids: id }, signal), row = data.list.find(x => String(x.vod_id) === id)
    if (!row) throw new RequestError('这个资源暂时无法找到', 'format')
    const detail = parseDetail(this.source.id, row)
    if (detail.kind === 'other' && detail.categories[0]) detail.kind = kindOf(detail.categories[0].name)
    return detail
  }
  resolve(_detail: DramaDetail, episode: DramaDetail['routes'][number]['episodes'][number]) { return { url: episode.url, headers: {} } }
}
