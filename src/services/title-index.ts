import { reactive } from 'vue'
import { TITLE_FEEDS, TITLE_LIMIT, TITLE_PAGE_SIZE, indexTitle, mergeTitles, parseTitleFeed, suggestTitles, type IndexedTitle, type TitleSuggestion } from '@/domain/title-index'
import bundledTitles from '@/data/tv-title-seed.json'
import { sha256 } from '@/domain/config-feed'
import { readLocal, writeLocal } from './storage'
import { requestText } from './http'
import { AbortController } from '@/platform/cancellation'

interface Snapshot { version: 1; generation: number; rows: TitleSuggestion[]; next: number; cycleAt: number; completedAt: number; archivePage: number }
interface Envelope { body: string; hash: string }
const KEY = 'freetv:v3:hot-titles'
const pagesPerCycle = TITLE_FEEDS.length * 2
const firstArchivePage = 3, lastArchivePage = 4
export const titleSyncState = reactive({ busy: false, count: 0, updatedAt: 0, completed: 0, message: '正在准备热门片名' })

// Dependencies make interrupted writes, failures and pacing testable without real requests.
export function createTitleIndex(deps: {
  read: (key: string) => unknown; write: (key: string, value: unknown) => void
  request: typeof requestText; now?: () => number; wait?: (ms: number) => Promise<void>; seed?: TitleSuggestion[]
}) {
  const now = deps.now || Date.now, wait = deps.wait || (ms => new Promise(resolve => setTimeout(resolve, ms)))
  let snapshot: Snapshot = {version:1,generation:0,rows:[],next:0,cycleAt:0,completedAt:0,archivePage:firstArchivePage}
  let indexed: IndexedTitle[] = [], seed: IndexedTitle[] = [], hydrated = false, running: Promise<void> | undefined, paused = true
  let controller: AbortController | undefined, started = false, pending = false, fresh = false, failed = false
  let requestAt: number | undefined
  function publish() {
    titleSyncState.count = new Set([...indexed,...seed].map(row=>row.normalized)).size
    titleSyncState.updatedAt = snapshot.completedAt
    titleSyncState.completed = snapshot.next
  }
  function restore() {
    if (hydrated) return
    hydrated = true
    const valid: Snapshot[] = []
    for (const slot of [0,1]) {
      try {
        const envelope = deps.read(`${KEY}:${slot}`) as Envelope
        if (!envelope || sha256(envelope.body) !== envelope.hash) continue
        const value = JSON.parse(envelope.body) as Snapshot
        if (value.version !== 1 || !Number.isInteger(value.generation) || !Number.isInteger(value.next) || value.next < 0 || value.next > pagesPerCycle || !Array.isArray(value.rows) || value.rows.length > TITLE_LIMIT || !Number.isFinite(value.cycleAt) || !Number.isFinite(value.completedAt)) continue
        if (value.rows.some(row => !row || !/^\d+$/.test(row.id) || typeof row.title !== 'string' || !row.title || row.title.length > 160 || !['movie','tv'].includes(row.type) || !Number.isFinite(row.seenAt) || !Number.isFinite(row.rank))) continue
        if (!Number.isInteger(value.archivePage) || value.archivePage < 1 || value.archivePage > lastArchivePage) value.archivePage = firstArchivePage
        valid.push(value)
      } catch { /* independently validate the second snapshot */ }
    }
    if (valid.length) snapshot = valid.sort((a,b) => b.generation-a.generation)[0]
    indexed = snapshot.rows.map(indexTitle)
    seed = (deps.seed || []).map(indexTitle)
    publish()
    titleSyncState.message=snapshot.completedAt?'热门片名已更新 · 冷启动时后台更新':snapshot.rows.length?'热门片名同步未完成，稍后继续':'正在准备热门片名'
  }
  function persist(next: Snapshot, nextIndex = indexed) {
    const value = {...next, generation:snapshot.generation+1}, body = JSON.stringify(value)
    deps.write(`${KEY}:${value.generation%2}`, {body,hash:sha256(body)})
    snapshot = value; indexed = nextIndex; publish()
  }
  async function work() {
    restore()
    if (paused || !pending) return
    titleSyncState.busy = true
    try {
      // Each process starts with the popular feeds. Pausing within this process
      // preserves the committed category checkpoint; warm resumes never start a cycle.
      if (fresh) { persist({...snapshot,next:0,cycleAt:now()}); fresh=false; failed=false }
      while (!paused && snapshot.next < pagesPerCycle) {
        const feedIndex = snapshot.next % TITLE_FEEDS.length
        const feed = TITLE_FEEDS[feedIndex]
        const offset = snapshot.next < TITLE_FEEDS.length ? 0 : snapshot.archivePage * TITLE_PAGE_SIZE
        titleSyncState.message = `正在更新${feed.type==='movie'?'电影':'剧集'} · ${feed.tag}`
        if(requestAt!==undefined){const remaining=2000-(now()-requestAt);if(remaining>0)await wait(remaining)}
        if(paused)return
        controller = new AbortController()
        const query = `type=${feed.type}&tag=${encodeURIComponent(feed.tag)}&sort=${feed.tag==='最新'?'time':'recommend'}&page_limit=${TITLE_PAGE_SIZE}&page_start=${offset}`
        requestAt=now()
        let incoming: TitleSuggestion[]
        try {
          const response = await deps.request(`https://movie.douban.com/j/search_subjects?${query}`, {signal:controller.signal,timeout:10000,headers:{Referer:'https://movie.douban.com/'},maxBytes:512*1024})
          if (paused || controller.signal.aborted) return
          if (response.status !== 200) throw new Error('热门片名暂时无法更新')
          incoming = parseTitleFeed(response.text,feed.type,snapshot.cycleAt,offset).map(row=>({...row,rank:row.rank*4+(feedIndex<4?feedIndex:500+feedIndex)}))
        } catch {
          if (paused || controller.signal.aborted) return
          failed=true
          persist({...snapshot,next:snapshot.next+1})
          continue
        }
        const rows = mergeTitles(snapshot.rows, incoming,now())
        const previous = new Map(indexed.map(row=>[row.id,row]))
        const nextIndex: IndexedTitle[] = []
        for (let start=0;start<rows.length;start+=100) {
          for (const row of rows.slice(start,start+100)) {
            const old = previous.get(row.id)
            nextIndex.push(old?.title===row.title?{...old,...row}:indexTitle(row))
          }
          await wait(0)
          if (paused || controller.signal.aborted) return
        }
        persist({...snapshot,rows,next:snapshot.next+1},nextIndex)
        await wait(2000)
      }
      if (snapshot.next === pagesPerCycle) {
        const archivePage = snapshot.archivePage===lastArchivePage ? 1 : snapshot.archivePage+1
        persist({...snapshot,next:0,archivePage,completedAt:failed?snapshot.completedAt:now()}); pending=false
        titleSyncState.message = failed ? '部分片名暂未更新，已保留收录，下次启动重试' : '热门片名已更新 · 冷启动时后台更新'
      }
    } catch {
      if (!paused && !controller?.signal.aborted) {
        pending=false
        titleSyncState.message='本次更新未完成，已有片名仍可搜索；可手动更新或下次启动再试'
      }
    } finally { titleSyncState.busy=false; controller=undefined }
  }
  function drain(): Promise<void> {
    if (running) return running.then(()=>drain())
    if (paused || !pending) return Promise.resolve()
    running=work().finally(()=>{running=undefined})
    return running
  }
  return {
    restore,
    suggestions(input: string) { restore(); return suggestTitles([...indexed,...seed],input) },
    refresh(force=false) {
      if (force && !(running && !paused)) { pending=true; fresh=true }
      return drain()
    },
    pause() { paused=true; controller?.abort() },
    resume() {
      paused=false
      if (!started) { started=true; pending=true; fresh=true }
      return drain()
    },
  }
}
const seed = bundledTitles.map(([title,type],rank):TitleSuggestion=>({id:`seed-${rank}`,title,type:type==='movie'?'movie':'tv',rank:10000+rank,seenAt:0}))
export const hotTitles = createTitleIndex({read:readLocal,write:writeLocal,request:requestText,seed})
let foreground = false, playing = false
export function setTitleForeground(value: boolean) {
  foreground=value
  if (value&&!playing) void hotTitles.resume(); else hotTitles.pause()
}
export function setTitlePlayback(value: boolean) { playing=value; if(value)hotTitles.pause();else if(foreground)void hotTitles.resume() }
export function titleSearchHistory() { const value=readLocal<unknown>(`${KEY}:history`);return Array.isArray(value)?value.filter((row):row is string=>typeof row==='string'&&!!row.trim()&&row.length<=160).slice(0,10):[] }
export function rememberTitleSearch(input: string) {
  const title=input.trim(); if(!title)return
  writeLocal(`${KEY}:history`,[title,...titleSearchHistory().filter(row=>row!==title)].slice(0,10))
}
