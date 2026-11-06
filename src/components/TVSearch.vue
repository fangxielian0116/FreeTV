<template><view class="tv-search">
  <view class="tv-query" :class="{'tv-query-editing':systemInput}">
    <input class="tv-query-input" :value="modelValue" :adjust-position="false" placeholder="输入片名、首字母或拼音" confirm-type="search" @input="systemUpdate" @confirm="confirm" @focus="startSystemInput" @blur="endSystemInput" @keyboardheightchange="keyboardChanged"/>
  </view>
  <view class="tv-search-columns"><view class="tv-keyboard"><view class="tv-keys"><button v-for="letter in letters" :key="letter" :data-tv-id="'key-'+letter" :data-tv-default="letter==='A'" @click="append(letter)">{{letter}}</button></view><view class="tv-key-actions"><button @click="change(modelValue.slice(0,-1))">删除</button><button @click="change('')">清空</button><button data-tv-id="system-input">中文输入</button><button class="tv-submit" data-tv-id="submit-search" @click="submit">搜索</button></view>
  <text class="hint">例如 kb / kuangb → 狂飙</text></view>
  <view class="tv-suggestions"><text class="section-title">{{modelValue?'片名联想':'近期热门'}}</text><button v-for="row in suggestions" :key="row.id" :data-tv-id="'suggest-'+row.id" class="tv-suggestion" @click="choose(row.title)">{{row.title}}<text>{{row.type==='movie'?'电影':'剧集'}}</text></button><text v-if="!suggestions.length" class="hint">{{titleSyncState.busy?'正在同步热门片名…':modelValue?'暂无线索，可输入中文直接搜索':'热门片名稍后自动更新'}}</text></view></view>
  <view v-if="!modelValue&&history.length" class="tv-history"><text class="hint">最近搜索</text><button v-for="title in history" :key="title" @click="choose(title)">{{title}}</button></view>
</view></template>
<script setup lang="ts">
import {computed,ref} from 'vue'
import {hotTitles,titleSyncState,titleSearchHistory} from '@/services/title-index'
const props=defineProps<{modelValue:string}>(),emit=defineEmits<{'update:modelValue':[value:string];search:[];'blur-query':[]}>()
const letters='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split(''),systemInput=ref(false),history=ref(titleSearchHistory())
let keyboardShown=false, keyboardClosedAt=0
const suggestions=computed(()=>{void titleSyncState.count;void titleSyncState.completed;return hotTitles.suggestions(props.modelValue)})
function change(value:string){emit('update:modelValue',value)}function append(value:string){change(props.modelValue+value.toLowerCase())}
function choose(title:string){change(title);submit()}
function startSystemInput(){
  keyboardShown=false
  keyboardClosedAt=0
  systemInput.value=true
}
function endSystemInput(){systemInput.value=false}
function closeSystemInput(){
  if(!systemInput.value)return
  endSystemInput()
  emit('blur-query')
  uni.hideKeyboard()
}
function keyboardChanged(event:{detail:{height:number}}){
  if(!systemInput.value)return
  if(event.detail.height>0)keyboardShown=true
  else if(keyboardShown){keyboardClosedAt=Date.now();endSystemInput();emit('blur-query')}
}
function systemUpdate(event:Event){change((event as CustomEvent<{value:string}>).detail.value)}
function confirm(event:{detail:{value:string}}){change(event.detail.value);submit()}
function submit(){closeSystemInput();emit('search')}
function handleBack(){
  if(systemInput.value){closeSystemInput();return true}
  // Android can deliver the page back event just after reporting a hidden IME.
  if(keyboardClosedAt&&Date.now()-keyboardClosedAt<500){keyboardClosedAt=0;return true}
  return false
}
defineExpose({handleBack})
</script>
<style scoped>
.tv-query{display:flex;align-items:center;justify-content:space-between;background:var(--ft-surface);border:1px solid var(--ft-border);border-radius:calc(8 * var(--tv-unit));padding:calc(8 * var(--tv-unit)) calc(16 * var(--tv-unit));margin-bottom:calc(20 * var(--tv-unit));font-size:calc(23 * var(--tv-unit));min-height:calc(60 * var(--tv-unit))}.tv-query button{background:#237da8;padding:calc(8 * var(--tv-unit)) calc(25 * var(--tv-unit))}.tv-search-columns{display:flex;gap:calc(38 * var(--tv-unit));align-items:flex-start}.tv-keyboard{width:43%;flex-shrink:0}.tv-keys{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:calc(10 * var(--tv-unit))}.tv-keys button{width:100%;height:calc(40 * var(--tv-unit));padding:0;background:var(--ft-soft);font-size:calc(20 * var(--tv-unit))}.tv-key-actions{display:flex;gap:calc(12 * var(--tv-unit));margin:calc(14 * var(--tv-unit)) 0}.tv-key-actions button{flex:1;background:var(--ft-soft);padding:calc(8 * var(--tv-unit)) calc(4 * var(--tv-unit));font-size:calc(16 * var(--tv-unit))}.tv-suggestions{flex:1;min-width:0}.tv-suggestions>.section-title{display:block;margin-bottom:calc(10 * var(--tv-unit))}.tv-suggestion{display:flex;justify-content:space-between;text-align:left;background:var(--ft-surface);padding:calc(8 * var(--tv-unit)) calc(16 * var(--tv-unit));margin-bottom:calc(8 * var(--tv-unit));width:100%;white-space:nowrap;overflow:hidden}.tv-suggestion text{font-size:calc(13 * var(--tv-unit));color:var(--ft-muted);margin-left:calc(12 * var(--tv-unit))}.tv-history{display:flex;flex-wrap:wrap;align-items:center;gap:calc(12 * var(--tv-unit));margin-top:calc(20 * var(--tv-unit))}.tv-history button{background:var(--ft-soft);padding:calc(6 * var(--tv-unit)) calc(14 * var(--tv-unit))}.tv-system-input{margin-bottom:calc(12 * var(--tv-unit))}
</style>
<style>
.tv-screen.tv-screen .tv-query .tv-query-input{flex:1;min-width:0;height:calc(42 * var(--tv-unit));font-size:calc(21 * var(--tv-unit));background:transparent}
.tv-screen.tv-screen .tv-query input{color:inherit;opacity:1;-webkit-text-fill-color:currentColor;outline:none!important;box-shadow:none;transform:none;background:transparent!important}
.tv-screen.tv-screen .tv-query-editing{border-color:var(--ft-accent);box-shadow:inset 0 0 0 1px var(--ft-accent)}
</style>
