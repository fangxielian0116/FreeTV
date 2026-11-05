<template><view class="screen"><TVNavigation v-if="TV_BUILD" :active="tvActive"/><view v-if="TV_BUILD" class="tv-back-row"><button class="quiet" @click="back">‹ 返回</button></view>
  <text class="title">设置</text>
  <view class="section-heading"><text class="section-title">片库选择</text><text class="hint">自动模式只在遇到问题时寻找可靠的替代资源</text></view>
  <view class="mode-row"><button :class="['mode',{selected:sourceState.mode==='auto'}]" @click="automatic">自动选择</button><button :class="['mode',{selected:sourceState.mode==='fixed'}]" @click="showPicker">固定片库</button></view>
  <button class="current-source row between" @click="showPicker"><view><text class="source-name">{{currentSource().name}}</text><text class="hint">{{sourceState.mode==='auto'?'当前自动使用':'已固定使用'}} · {{TV_BUILD?'确认更换':'点击更换'}}</text></view><text class="change">选择片库 ›</text></button>
  <view class="section-heading"><text class="section-title">片库配置</text></view><view class="card"><text>{{sourceState.syncMessage}}</text><text class="hint">版本 {{sourceState.version}}</text><text class="hint">{{sourceState.syncAt?'最近检查：'+formatChinaDateTime(sourceState.syncAt):'尚未检查'}}</text><button class="secondary full" :disabled="sourceState.syncing" @click="syncSources">{{sourceState.syncing?'检查中…':'检查更新'}}</button></view>
  <view v-if="TV_BUILD" class="section-heading"><text class="section-title">热门片名</text><view class="card"><text>{{titleSyncState.message}}</text><text class="hint">已收录 {{titleSyncState.count}} 个片名 · 冷启动时后台更新</text><text class="hint">{{titleSyncState.updatedAt?'最近更新：'+formatChinaDateTime(titleSyncState.updatedAt):'首次同步正在后台进行'}}</text><button class="secondary full" :disabled="titleSyncState.busy" @click="hotTitles.refresh(true)">更新热门片名</button></view></view>
  <view class="section-heading"><text class="section-title">本机记录</text></view><button class="secondary full" @click="clear">清除收藏和观看记录</button><text class="hint about">FreeTV {{TV_BUILD?'TV ':''}}{{APP_VERSION}} · 记录仅保存在本机</text>
  <view v-if="pickerOpen" class="picker-mask" @click="closePicker"><view class="picker-sheet" @click.stop><view class="row between picker-heading"><text class="section-title">选择固定片库</text><button class="quiet" @click="closePicker">关闭</button></view><input v-if="!TV_BUILD" v-model="filter" class="field source-search" placeholder="搜索片库名称" confirm-type="search"/><scroll-view scroll-y class="source-scroll"><view class="source-grid"><button v-for="source in choices" :key="source.id" :class="['source-option',{selected:sourceState.currentId===source.id}]" @click="fixed(source.id)"><text>{{source.name}}</text><text v-if="sourceState.currentId===source.id" class="option-status">{{sourceState.mode==='fixed'?'已固定':'当前使用'}}</text></button></view><view v-if="!choices.length" class="no-sources">没有找到这个片库</view></scroll-view><text class="hint picker-hint">选择后固定使用，可随时改回自动选择</text></view></view>
</view></template>
<script setup lang="ts">
import TVNavigation from '@/components/TVNavigation.vue'
import {TV_BUILD,APP_VERSION} from '@/platform/target'
import {useTVPage} from '@/platform/tv-page'
const tvActive=useTVPage()
import {titleSyncState,hotTitles} from '@/services/title-index'

import {computed,ref} from 'vue'
import {formatChinaDateTime} from '@/domain/date-time'
import {onBackPress} from '@dcloudio/uni-app'
import {sourceState,currentSource,rankings,selectSource,setSourceMode,syncSources} from '@/services/source-store'
import {library} from '@/services/library';import {notify} from '@/services/device';import {player} from '@/platform/player'
const pickerOpen=ref(false),filter=ref('')
const choices=computed(()=>{const keyword=filter.value.trim().toLowerCase();return rankings().map(row=>row.source).filter(source=>!keyword||[source.name,source.id,...source.aliases].some(name=>name.toLowerCase().includes(keyword))).sort((a,b)=>Number(b.id===sourceState.currentId)-Number(a.id===sourceState.currentId))})
function back(){uni.navigateBack({fail:()=>uni.reLaunch({url:'/pages/index/index'})})}
function showPicker(){filter.value='';pickerOpen.value=true}
function closePicker(){pickerOpen.value=false;uni.hideKeyboard()}
onBackPress(()=>{if(pickerOpen.value){closePicker();return true}return false})
function automatic(){setSourceMode('auto');notify('已恢复自动选择')}
function fixed(id:string){selectSource(id,'fixed');closePicker();notify('已固定片库，返回首页后生效')}
function clear(){uni.showModal({title:'清除本机记录？',content:'将清除收藏及观看进度。',success:({confirm})=>{if(confirm){library.clear();player.clearPending();notify('本机记录已清除')}}})}
</script>
<style scoped>
.mode-row{display:flex;padding:4px;background:var(--ft-soft);border-radius:12px}.mode{flex:1;background:transparent;padding:10px;color:var(--ft-muted);font-size:14px}.mode.selected{background:white;color:var(--ft-accent-dark);font-weight:600}.current-source{width:100%;background:white;border:1px solid var(--ft-border);padding:16px;margin-top:12px;text-align:left}.source-name{display:block;font-size:16px;font-weight:600}.change{margin-left:12px;color:var(--ft-accent);font-size:12px;white-space:nowrap}.full{width:100%;margin-top:15px}.about{text-align:center;margin-top:30px}.picker-mask{position:fixed;top:0;left:0;right:0;bottom:0;z-index:100;display:flex;align-items:flex-end;justify-content:center;background:rgba(15,35,49,.45)}.picker-sheet{width:100%;max-width:560px;max-height:85vh;padding:16px 20px calc(16px + env(safe-area-inset-bottom));border-radius:20px 20px 0 0;background:var(--ft-bg)}.picker-heading{margin-bottom:12px}.source-search{height:44px;min-height:44px;padding:0 12px}.source-scroll{height:42vh;margin-top:14px}.source-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.source-option{position:relative;display:flex;align-items:center;justify-content:center;flex-direction:column;width:100%;height:66px;padding:8px;background:white;border:1px solid var(--ft-border);font-size:14px;overflow:hidden}.source-option.selected{color:var(--ft-accent-dark);border-color:var(--ft-accent);background:var(--ft-soft)}.option-status{font-size:10px;margin-top:3px}.picker-hint{margin-top:12px;text-align:center}.no-sources{padding:40px 0;text-align:center;color:var(--ft-muted);font-size:14px}
</style>
