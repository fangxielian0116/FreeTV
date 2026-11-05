<template>
  <view class="screen home"><TVNavigation v-if="TV_BUILD" :active="tvActive"/><view class="row between brand-row" :class="{'tv-home-header':TV_BUILD}"><view class="row brand"><view class="brand-mark">▶</view><text>FreeTV</text></view><SearchBar v-if="TV_BUILD" v-model="keyword" @search="search"/><view v-if="TV_BUILD" class="tv-nav"><button :class="{active:tab==='discover'}" @click="tab='discover'">发现</button><button :class="{active:tab==='library'}" @click="showLibrary">我的追剧</button><button @click="settings">设置</button></view><button v-else class="quiet" @click="settings">设置</button></view>
  <SearchBar v-if="!TV_BUILD" v-model="keyword" @search="search"/>
  <view v-if="!TV_BUILD" class="row tabs"><button :class="{active:tab==='discover'}" @click="tab='discover'">发现</button><button :class="{active:tab==='library'}" @click="showLibrary">我的追剧</button></view>
  <template v-if="tab==='discover'"><view v-if="recent.length" class="continue-section"><text class="section-title">继续观看</text><button v-for="entry in recent.slice(0,2)" :key="entry.sourceId+entry.vodId" class="continue-card" @click="open(entry.item)"><text>{{entry.item.title}}</text><text class="hint">{{entry.episodeLabel}} · {{formatTime(entry.position)}}</text><text class="continue-arrow">▶</text></button></view>
  <view class="categories category-row"><button v-for="item in HOME_CATEGORIES" :key="item.id" :class="{selected:category===item.id}" @click="choose(item.id)">{{item.name}}</button></view>
  <view class="row between listing-heading"><view><text class="section-title">近期新作</text><text class="hint">近两年作品 · 按片库更新时间排序</text></view><button class="quiet" :disabled="busy" @click="reload">刷新</button></view>
  <text v-if="cached" class="hint">当前显示上次保存的内容</text><view v-if="error" class="notice error">{{error}}<button class="quiet" @click="reload">重试</button></view>
  <view v-if="busy&&!items.length" class="empty">正在加载片库…</view><view v-else-if="!items.length&&!error" class="empty">这个分类暂时没有内容</view>
  <view class="drama-grid"><DramaCard v-for="(item,index) in items" :key="itemKey(item)" :item="item" :refresh-key="posterGeneration" :eager="index<2" @open="open"/></view><button v-if="next" class="secondary load-more" :disabled="busy" @click="loadMore">{{busy?'加载中…':'加载更多'}}</button></template>
  <template v-else><view v-if="!favorites.length" class="empty">把喜欢的影视加入追剧，就能在这里找到</view><view class="drama-grid"><DramaCard v-for="(item,index) in favorites" :key="itemKey(item)" :item="item" :eager="index<2" @open="open"/></view></template>
  </view>
</template>
<script setup lang="ts">
import {ref} from 'vue'
import TVNavigation from '@/components/TVNavigation.vue'
import {TV_BUILD} from '@/platform/target'
import {useTVPage} from '@/platform/tv-page'
const tvActive=useTVPage()
import {AbortController} from '@/platform/cancellation'
import {onLoad,onShow,onHide,onUnload} from '@dcloudio/uni-app'
import DramaCard from '@/components/DramaCard.vue'
import SearchBar from '@/components/SearchBar.vue'
import {itemKey,type CatalogItem,type CatalogPage} from '@/domain/catalog'
import {HOME_CATEGORIES,homeCacheKey,savedHomeCategory,type HomeKind} from '@/domain/home'
import {readLocal,writeLocal} from '@/services/storage'
import {searchUrl} from '@/domain/search-query'
import type {WatchProgress} from '@/domain/playback'
import {bootstrap,restoreNativeProgress} from '@/services/bootstrap'
import {loadCatalog} from '@/services/catalog'
import {catalogCache,library} from '@/services/library'
import {currentSource} from '@/services/source-store'
import {formatTime} from '@/services/device'
const items=ref<CatalogItem[]>([]),recent=ref<WatchProgress[]>([]),favorites=ref<CatalogItem[]>([]),keyword=ref(''),category=ref<HomeKind>(savedHomeCategory(readLocal('freetv:v3:home-category'))),tab=ref('discover'),error=ref(''),busy=ref(false),cached=ref(false),next=ref<number|null>(null),posterGeneration=ref(0)
let generation=0,controller:AbortController|undefined,displayedSource=''
onHide(()=>{generation++;controller?.abort();busy.value=false})
onLoad(()=>{bootstrap();void reload()});onShow(()=>{restoreNativeProgress();recent.value=library.progress();favorites.value=library.favorites();if(!busy.value&&(!displayedSource||displayedSource!==currentSource().id)){void reload()}});onUnload(()=>{generation++;controller?.abort()})
async function load(page=1,reset=true){
  const current=++generation;controller?.abort();const requestController=new AbortController();controller=requestController
  busy.value=true;error.value='';const source=currentSource(),selectedCategory=category.value
  if(reset){posterGeneration.value++;const old=catalogCache.get<CatalogPage>(homeCacheKey(source.id,selectedCategory,page));items.value=old?.items||[];next.value=old?.next||null;cached.value=!!old}
  try{
    const result=await loadCatalog({page,kind:selectedCategory,signal:requestController.signal,canCommit:()=>current===generation})
    if(current!==generation)return
    displayedSource=result.source.id
    items.value=reset?result.page.items:[...items.value,...result.page.items.filter(x=>!items.value.some(y=>itemKey(y)===itemKey(x)))]
    next.value=result.page.next;cached.value=false
  }catch(e){if(current===generation)error.value=(e as Error).message}finally{if(current===generation)busy.value=false}
}
function reload(){return load()}function loadMore(){if(next.value&&!busy.value)void load(next.value,false)}function choose(id:HomeKind){if(category.value===id)return;category.value=id;writeLocal('freetv:v3:home-category',id);void reload()}
function search(){if(TV_BUILD||keyword.value.trim())uni.navigateTo({url:searchUrl(keyword.value)})}function settings(){uni.navigateTo({url:'/pages/settings/settings'})}function showLibrary(){favorites.value=library.favorites();tab.value='library'}
function open(item:CatalogItem){uni.navigateTo({url:`/pages/detail/detail?source=${encodeURIComponent(item.sourceId)}&id=${encodeURIComponent(item.id)}`})}
</script>
<style scoped>
.home{padding-top:calc(16px + var(--status-bar-height,24px))}.brand-row{margin-bottom:20px}.brand{font-size:23px;font-weight:700;gap:9px}.brand-mark{width:29px;height:29px;border-radius:9px;background:var(--ft-accent);color:white;text-align:center;font-size:13px;line-height:29px}.tabs{gap:25px;border-bottom:1px solid var(--ft-border);margin-bottom:22px}.tabs button{padding:11px 0;background:transparent;border-radius:0;color:var(--ft-muted);border-bottom:2px solid transparent}.tabs .active{color:var(--ft-accent-dark);border-color:var(--ft-accent)}.continue-section{margin-bottom:22px}.continue-card{position:relative;display:block;width:100%;background:var(--ft-soft);padding:12px 40px 12px 14px;margin-top:10px;text-align:left;font-size:14px}.continue-arrow{position:absolute;right:15px;top:24px;color:var(--ft-accent)}.categories{margin-top:8px}.category-row{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;padding-bottom:9px}.category-row button{width:100%;min-width:0;padding:8px 3px;white-space:nowrap;background:transparent;border:1px solid var(--ft-border);font-size:12px;border-radius:20px;color:var(--ft-muted)}.category-row .selected{background:var(--ft-accent);color:white;border-color:var(--ft-accent)}.listing-heading{margin:10px 0}.drama-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 15px}.empty{padding:55px 10px;text-align:center;color:var(--ft-muted)}.load-more{width:100%;margin-top:15px}@media(min-width:600px){.drama-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
</style>
<style scoped>
.brand,.tabs{gap:0}.brand-mark{margin-right:9px}.tabs button+button{margin-left:25px}
</style>
