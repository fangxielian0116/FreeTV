<template><view class="tv-search">
  <view class="tv-query"><text>{{modelValue||'输入片名、首字母或拼音'}}</text></view>
  <view class="tv-search-columns"><view class="tv-keyboard"><view class="tv-keys"><button v-for="letter in letters" :key="letter" :data-tv-id="'key-'+letter" :data-tv-default="letter==='A'" @click="append(letter)">{{letter}}</button></view><view class="tv-key-actions"><button @click="change(modelValue.slice(0,-1))">删除</button><button @click="change('')">清空</button><button @click="systemInput=true">中文输入</button><button class="tv-submit" data-tv-id="submit-search" @click="$emit('search')">搜索</button></view>
  <input v-if="systemInput" :focus="systemInput" class="field tv-system-input" :value="modelValue" placeholder="使用系统输入法输入中文" confirm-type="search" @input="systemUpdate" @confirm="confirm"/>
  <text class="hint">例如 kb / kuangb → 狂飙</text></view>
  <view class="tv-suggestions"><text class="section-title">{{modelValue?'片名联想':'近期热门'}}</text><button v-for="row in suggestions" :key="row.id" :data-tv-id="'suggest-'+row.id" class="tv-suggestion" @click="choose(row.title)">{{row.title}}<text>{{row.type==='movie'?'电影':'剧集'}}</text></button><text v-if="!suggestions.length" class="hint">{{titleSyncState.busy?'正在同步热门片名…':modelValue?'暂无线索，可输入中文直接搜索':'热门片名稍后自动更新'}}</text></view></view>
  <view v-if="!modelValue&&history.length" class="tv-history"><text class="hint">最近搜索</text><button v-for="title in history" :key="title" @click="choose(title)">{{title}}</button></view>
</view></template>
<script setup lang="ts">
import {computed,ref} from 'vue'
import {onBackPress} from '@dcloudio/uni-app'
import {hotTitles,titleSyncState,titleSearchHistory} from '@/services/title-index'
const props=defineProps<{modelValue:string}>(),emit=defineEmits<{'update:modelValue':[value:string];search:[]}>()
const letters='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split(''),systemInput=ref(false),history=ref(titleSearchHistory())
const suggestions=computed(()=>{void titleSyncState.count;void titleSyncState.completed;return hotTitles.suggestions(props.modelValue)})
function change(value:string){emit('update:modelValue',value)}function append(value:string){change(props.modelValue+value.toLowerCase())}
function choose(title:string){change(title);emit('search')}
function systemUpdate(event:Event){change((event as any).detail.value)}function confirm(){systemInput.value=false;uni.hideKeyboard();emit('search')}
onBackPress(()=>{if(systemInput.value){systemInput.value=false;uni.hideKeyboard();return true}return false})
</script>
<style scoped>
.tv-query{display:flex;align-items:center;justify-content:space-between;background:var(--ft-surface);border:1px solid var(--ft-border);border-radius:calc(8 * var(--tv-unit));padding:calc(8 * var(--tv-unit)) calc(16 * var(--tv-unit));margin-bottom:calc(20 * var(--tv-unit));font-size:calc(23 * var(--tv-unit));min-height:calc(60 * var(--tv-unit))}.tv-query button{background:#237da8;padding:calc(8 * var(--tv-unit)) calc(25 * var(--tv-unit))}.tv-search-columns{display:flex;gap:calc(38 * var(--tv-unit));align-items:flex-start}.tv-keyboard{width:43%;flex-shrink:0}.tv-keys{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:calc(10 * var(--tv-unit))}.tv-keys button{width:100%;height:calc(40 * var(--tv-unit));padding:0;background:var(--ft-soft);font-size:calc(20 * var(--tv-unit))}.tv-key-actions{display:flex;gap:calc(12 * var(--tv-unit));margin:calc(14 * var(--tv-unit)) 0}.tv-key-actions button{flex:1;background:var(--ft-soft);padding:calc(8 * var(--tv-unit)) calc(4 * var(--tv-unit));font-size:calc(16 * var(--tv-unit))}.tv-suggestions{flex:1;min-width:0}.tv-suggestions>.section-title{display:block;margin-bottom:calc(10 * var(--tv-unit))}.tv-suggestion{display:flex;justify-content:space-between;text-align:left;background:var(--ft-surface);padding:calc(8 * var(--tv-unit)) calc(16 * var(--tv-unit));margin-bottom:calc(8 * var(--tv-unit));width:100%;white-space:nowrap;overflow:hidden}.tv-suggestion text{font-size:calc(13 * var(--tv-unit));color:var(--ft-muted);margin-left:calc(12 * var(--tv-unit))}.tv-history{display:flex;flex-wrap:wrap;align-items:center;gap:calc(12 * var(--tv-unit));margin-top:calc(20 * var(--tv-unit))}.tv-history button{background:var(--ft-soft);padding:calc(6 * var(--tv-unit)) calc(14 * var(--tv-unit))}.tv-system-input{margin-bottom:calc(12 * var(--tv-unit))}
</style>
