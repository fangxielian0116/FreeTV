<template><view class="screen" :class="{'tv-search-page':TV_BUILD}">
  <TVNavigation v-if="TV_BUILD" :active="tvActive" :focus-request="focusRequest" :query-blur-request="queryBlurRequest"/>
  <view v-if="TV_BUILD" class="tv-back-row"><button class="quiet" @click="back">‹ 返回</button><text class="section-title">{{resultsMode?'搜索结果':'搜索影视'}}</text><button v-if="resultsMode" class="secondary" data-tv-id="edit-search" @click="editSearch">修改搜索</button></view>
  <TVSearch v-if="TV_BUILD&&!resultsMode" ref="tvSearch" v-model="input" @search="search" @blur-query="queryBlurRequest++"/>
  <SearchBar v-else-if="!TV_BUILD" v-model="input" placeholder="搜索想看的影视" @search="search"/>
  <template v-if="!TV_BUILD||resultsMode">
    <view v-if="TV_BUILD" class="tv-results-heading"><text class="title">“{{keyword}}”</text><text class="hint">{{busy?'正在查找相关影视…':error?'本次搜索未完成':items.length?'已找到 '+items.length+' 部'+(next?' · 下方可加载更多':''):'试试别名或更短的关键词'}}</text></view>
    <view v-if="error" class="notice error">{{error}}<button v-if="TV_BUILD" class="secondary" data-tv-id="retry-search" @click="retry">重试搜索</button></view>
    <view v-if="busy&&!items.length" class="empty">正在查找…</view><view v-else-if="showNoResults" class="empty"><text>暂时没有找到相关影视</text><text class="hint">试试别名或更短的关键词</text><button v-if="TV_BUILD" class="secondary" @click="editSearch">换个关键词</button></view>
    <view class="drama-grid"><DramaCard v-for="(item,index) in items" :key="itemKey(item)" :item="item" :eager="index<(TV_BUILD?6:2)" @open="open"/></view><button v-if="next" class="secondary full" :disabled="busy" @click="more">加载更多</button><button v-if="items.length&&!next" class="quiet full" :disabled="busy||sourceState.mode==='fixed'" @click="continueSearch">没有想看的？继续查找</button>
  </template>
</view></template>
<script setup lang="ts">
import TVNavigation from '@/components/TVNavigation.vue'
import {TV_BUILD} from '@/platform/target'
import {useTVPage} from '@/platform/tv-page'
const tvActive=useTVPage()
import TVSearch from '@/components/TVSearch.vue'
import {rememberTitleSearch} from '@/services/title-index'

import SearchBar from '@/components/SearchBar.vue'
import {readSearchQuery} from '@/domain/search-query'
import {AbortController} from '@/platform/cancellation'
import {ref,computed,nextTick} from 'vue';import {onBackPress,onLoad,onShow,onHide,onUnload} from '@dcloudio/uni-app';import DramaCard from '@/components/DramaCard.vue';import {itemKey,type CatalogItem} from '@/domain/catalog';import {searchCatalog} from '@/services/catalog';import {sourceState} from '@/services/source-store'
const input=ref(''),items=ref<CatalogItem[]>([]),busy=ref(false),error=ref(''),next=ref<number|null>(null);let keyword='',generation=0,controller:AbortController|undefined
const searched=ref(false),resultsMode=ref(false),focusRequest=ref<{id:string;token:number}>()
const settled=ref(false),showNoResults=computed(()=>searched.value&&settled.value&&!busy.value&&!error.value&&!items.value.length)
let focusToken=0
let displayedSource=''
const tvSearch=ref<{handleBack?:()=>boolean}>()
const queryBlurRequest=ref(0)
if(TV_BUILD)onBackPress(()=>tvSearch.value?.handleBack?.()===true)
onHide(()=>{generation++;controller?.abort();busy.value=false})
onShow(()=>{if(displayedSource&&displayedSource!==sourceState.currentId){items.value=[];next.value=null;void load()}})
onLoad(query=>{input.value=readSearchQuery(query);if(input.value.trim())search()});onUnload(()=>{generation++;controller?.abort()})
async function load(page=1,continueSearch=false,focusResults=false){if(!keyword)return;const current=++generation;controller?.abort();controller=new AbortController();busy.value=true;settled.value=false;error.value='';try{const result=await searchCatalog(keyword,{page,continueSearch,signal:controller.signal,canCommit:()=>generation===current});if(current!==generation)return;displayedSource=result.source.id;items.value=page===1?result.page.items:[...items.value,...result.page.items];next.value=result.page.next;settled.value=true}catch(e){if(current===generation)error.value=(e as Error).message}finally{if(current===generation){busy.value=false;if(TV_BUILD&&focusResults&&resultsMode.value){await nextTick();focusRequest.value={id:items.value[0]?'drama-'+itemKey(items.value[0]):error.value?'retry-search':'edit-search',token:++focusToken}}}}}
function back(){uni.navigateBack({fail:()=>uni.reLaunch({url:'/pages/index/index'})})}
function editSearch(){generation++;controller?.abort();busy.value=false;resultsMode.value=false;focusRequest.value=undefined}
function search(){const value=input.value.trim();if(!value)return;keyword=value;searched.value=true;resultsMode.value=true;next.value=null;if(TV_BUILD)rememberTitleSearch(value);items.value=[];void load(1,false,true)}function retry(){void load(1,false,true)}function more(){if(next.value)void load(next.value)}function continueSearch(){void load(1,true,true)}function open(item:CatalogItem){uni.navigateTo({url:`/pages/detail/detail?source=${item.sourceId}&id=${encodeURIComponent(item.id)}`})}
</script>

<style scoped>.drama-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 15px}.empty{display:flex;flex-direction:column;gap:8px;text-align:center;padding:50px 0;color:var(--ft-muted)}.full{width:100%;margin-top:12px}</style>
<style scoped>.tv-search-page .tv-back-row{align-items:center;margin-bottom:calc(14 * var(--tv-unit))}.tv-search-page .tv-back-row>.section-title{margin-right:auto;margin-left:calc(20 * var(--tv-unit))}.tv-results-heading{display:flex;align-items:baseline;gap:calc(20 * var(--tv-unit));margin-bottom:calc(18 * var(--tv-unit))}.tv-results-heading>.title{max-width:65%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tv-search-page .empty{padding:calc(55 * var(--tv-unit)) 0}.tv-search-page .empty button{align-self:center;margin-top:calc(16 * var(--tv-unit))}</style>
