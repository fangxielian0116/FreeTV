import type { CatalogPage, DramaDetail, SourceDefinition } from '@/domain/catalog'
import { MacCMSSource } from './catalog-source'
import { candidates, coolSource, currentSource, observe, selectSource, sourceState } from './source-store'
import { catalogCache } from './library'
import { BUILTIN_SOURCES, normalizeApi } from '@/domain/sources'
import { readLocal, writeLocal } from './storage'
import { AbortController } from '@/platform/cancellation'
import { SEARCH_BACKUP_MS } from '@/domain/recovery-policy'
import { homeCacheKey, type HomeKind } from '@/domain/home'
const verified = new Set<string>([...BUILTIN_SOURCES.map(source => normalizeApi(source.api)), ...(readLocal<string[]>('freetv:v3:directory-verified') || [])])
class DirectorySource extends MacCMSSource {
  private async qualify(signal?: AbortSignal) {
    const api = normalizeApi(this.source.api)
    if (verified.has(api)) return
    const directory = await super.list({ signal })
    if (!directory.items.length) throw new Error('这个来源尚未确认有可用目录')
    verified.add(api); writeLocal('freetv:v3:directory-verified', [...verified].slice(-128))
  }
  override async search(keyword: string, options: { page?: number; signal?: AbortSignal } = {}) { await this.qualify(options.signal); return super.search(keyword, options) }
  override async detail(id: string, signal?: AbortSignal) { await this.qualify(signal); return super.detail(id, signal) }
}
const adapters = new Map<string, DirectorySource>()
export function adapter(source: SourceDefinition) {
  const key = `${source.id}:${normalizeApi(source.api)}`
  let value = adapters.get(key)
  if (!value) { value = new DirectorySource({...source}); adapters.set(key,value) }
  else { adapters.delete(key); adapters.set(key,value) }
  while (adapters.size > 24) adapters.delete(adapters.keys().next().value!)
  return value
}
export async function loadCatalog(options: { page?: number; category?: string; kind?: HomeKind; signal?: AbortSignal; canCommit?: () => boolean } = {}): Promise<{ source: SourceDefinition; page: CatalogPage; changed: boolean }> {
  const initial = { ...currentSource() }, tried = new Set<string>(), canSwitch = sourceState.mode === 'auto' && (options.page || 1) === 1
  let source: SourceDefinition | undefined = initial, lastError: unknown
  for (let count = 0; source && count < (canSwitch ? 3 : 1); count++) {
    tried.add(source.id)
    try {
      const category = source.id === initial.id ? options.category : undefined
      const page = options.kind ? await adapter(source).home(options.kind, options) : await adapter(source).list({ ...options, category })
      if (options.signal?.aborted || options.canCommit?.() === false) throw new Error('请求已取消')
      if (!page.items.length && !category && !options.kind && (options.page || 1) === 1) throw new Error('片库目录暂不可用')
      if (!page.items.length && source.id !== initial.id) throw new Error('备用片库尚未确认有这个分类的内容')
      if (source.id !== initial.id) selectSource(source.id)
      catalogCache.put(options.kind ? homeCacheKey(source.id, options.kind, options.page) : `list:${source.id}:${category || ''}:${options.page || 1}`, page)
      return { source, page, changed: source.id !== initial.id }
    } catch (error) {
      lastError = error
      if (options.signal?.aborted || options.canCommit?.() === false || !sourceState.online) throw error
      observe(`directory:${Date.now()}:${source.id}`, source.id, 0, '目录请求失败'); coolSource(source.id)
      source = canSwitch ? candidates(tried)[0] : undefined
    }
  }
  throw lastError || new Error('片库暂不可用，请稍后重试')
}
export async function searchCatalog(keyword: string, options: { page?: number; signal?: AbortSignal; canCommit?: () => boolean; continueSearch?: boolean } = {}) {
  const source = { ...currentSource() }, page = options.continueSearch ? { items: [], page: 1, next: null, total: 0 } as CatalogPage : await adapter(source).search(keyword, options)
  if (page.items.length || sourceState.mode === 'fixed' || (options.page || 1) > 1 || !sourceState.online) return { source, page, changed: false }
  const attempt = `search:${source.id}:${keyword.trim().toLowerCase()}:${Math.floor(Date.now() / 600000)}`
  observe(attempt, source.id, .5, '搜索无结果', .1)
  const next = candidates(new Set([source.id]))[0]; if (!next) return { source, page, changed: false }
  const controller = new AbortController(), cancel = () => controller.abort(), timer = setTimeout(() => controller.abort(), SEARCH_BACKUP_MS)
  options.signal?.addEventListener('abort', cancel, { once: true }); if (options.signal?.aborted) controller.abort()
  try {
    const result = await adapter(next).search(keyword, { signal: controller.signal })
    if (controller.signal.aborted || options.canCommit?.() === false || sourceState.mode !== 'auto' || sourceState.currentId !== source.id) return { source, page, changed: false }
    if (!result.items.length) { observe(`search:${next.id}:${keyword}:${Math.floor(Date.now() / 600000)}`, next.id, .5, '搜索无结果', .1); return { source, page, changed: false } }
    selectSource(next.id); return { source: next, page: result, changed: true }
  } catch { return { source, page, changed: false } }
  finally { clearTimeout(timer); options.signal?.removeEventListener('abort', cancel) }
}
export async function loadDetail(source: SourceDefinition, id: string, signal?: AbortSignal): Promise<DramaDetail> { const detail = await adapter(source).detail(id, signal); catalogCache.saveDetail(detail); return detail }
