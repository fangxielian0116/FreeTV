<template><view class="poster-image"><view class="poster-placeholder"><text>{{title.slice(0,1)}}</text><text class="poster-word">FREE TV</text></view><image v-for="slot in slots" :key="slot.id" :src="slot.path" mode="aspectFill" :class="{loaded:slot.id===front&&slot.loaded}" @load="painted(slot)" @error="failed(slot)"/></view></template>
<script setup lang="ts">
import {ref,watch,onMounted,onBeforeUnmount,getCurrentInstance} from 'vue'
import {AbortController} from '@/platform/cancellation'
import {posterCache} from '@/services/poster-cache'
interface Slot {id:number;path:string;url:string;loaded:boolean}
const props=withDefaults(defineProps<{src:string;title:string;cacheKey?:string;refreshKey?:string|number;eager?:boolean}>(),{cacheKey:'',eager:false})
const cache=posterCache(),instance=getCurrentInstance(),slots=ref<Slot[]>([]),front=ref(0)
let id=0,latest=0,generation=0,eligible=props.eager,priority=props.eager?0:1,loading=false,attempts=0,controller:AbortController|undefined,timer:ReturnType<typeof setTimeout>|undefined,observer:ReturnType<typeof uni.createIntersectionObserver>|undefined
function candidate(path:string,url:string){
  if(!path||slots.value.some(slot=>slot.path===path))return
  latest=++id;slots.value=[...slots.value.filter(slot=>slot.id===front.value),{id:latest,path,url,loaded:false}]
}
function painted(slot:Slot){
  if(!slots.value.some(value=>value.id===slot.id))return
  slot.loaded=true;if(slot.id<front.value)return;front.value=slot.id
  if(slot.id===latest)slots.value=slots.value.filter(value=>value.id===slot.id)
  if(props.cacheKey)cache.remember(props.cacheKey,slot.url)
}
function scheduleRetry(){
  if(timer||attempts>=1||!eligible)return
  attempts++;timer=setTimeout(()=>{timer=undefined;void load()},1500)
}
function failed(slot:Slot){
  if(!slots.value.some(value=>value.id===slot.id))return
  cache.invalidate(slot.url,slot.path);slots.value=slots.value.filter(value=>value.id!==slot.id)
  if(front.value===slot.id)front.value=0
  scheduleRetry()
}
async function load(){
  if(!eligible||loading||!props.src)return
  const current=generation,url=props.src;controller?.abort();const task=new AbortController();controller=task
  const hit=cache.peek(url)||cache.previous(props.cacheKey)
  if(hit)candidate(hit.path,hit.url)
  loading=true
  try{const asset=await cache.request(url,priority,task.signal);if(current===generation&&!task.signal.aborted)candidate(asset.path,url)}
  catch{if(current===generation&&!task.signal.aborted)scheduleRetry()}
  finally{if(current===generation&&controller===task)loading=false}
}
watch(()=>[props.src,props.cacheKey],(_value,previous)=>{
  generation++;controller?.abort();loading=false;attempts=0;clearTimeout(timer);timer=undefined
  if(previous&&previous[1]!==props.cacheKey){slots.value=[];front.value=0}
  else slots.value=slots.value.filter(slot=>slot.id===front.value)
  void load()
},{immediate:true})
// Refresh retries a missing image; an already painted cover stays visible.
watch(()=>props.refreshKey,()=>{attempts=0;clearTimeout(timer);timer=undefined;void load()})
onMounted(()=>{
  try{
    observer=uni.createIntersectionObserver(instance?.proxy as any,{thresholds:[0],initialRatio:-1})
    observer.relativeToViewport({top:180,bottom:300}).observe('.poster-image',result=>{
      eligible=result.intersectionRatio>0
      const height=result.relativeRect.bottom-300
      priority=result.boundingClientRect.bottom>0&&result.boundingClientRect.top<height?0:1
      if(eligible){cache.promote(props.src,priority);void load()}
      else{controller?.abort();loading=false;clearTimeout(timer);timer=undefined}
    })
  }catch{eligible=true;void load()}
})
onBeforeUnmount(()=>{generation++;controller?.abort();observer?.disconnect();clearTimeout(timer)})
</script>
<style scoped>
.poster-image{position:relative;width:100%;height:100%;overflow:hidden;background:var(--ft-soft)}.poster-image image,.poster-placeholder{position:absolute;top:0;left:0;width:100%;height:100%}.poster-image image{opacity:0}.poster-image image.loaded{opacity:1}.poster-placeholder{display:flex;flex-direction:column;align-items:center;justify-content:center;background:linear-gradient(145deg,#d8ebf4,#9ec6d9);color:var(--ft-accent-dark);font:44px serif}.poster-word{margin-top:16px;font:9px sans-serif;letter-spacing:3px}
</style>
