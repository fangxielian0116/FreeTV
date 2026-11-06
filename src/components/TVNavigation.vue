<template><view v-if="enabled" :id="hostId" class="tv-navigation-host" :prop="state" :change:prop="navigation.update" /></template>
<script lang="ts">
import { defineComponent } from 'vue'
import { TV_BUILD } from '@/platform/target'
export default defineComponent({
  props: { active: {type:Boolean,default:true}, restoreKey: {type:String,default:''}, focusRequest: {type:Object,default:null}, queryBlurRequest: {type:Number,default:0} },
  data: () => ({enabled:TV_BUILD,hostId:'tv-nav-'+Math.random().toString(36).slice(2),}),
  computed: { state(): object { return {hostId:this.hostId,active:this.active,restoreKey:this.restoreKey,focusRequest:this.focusRequest,queryBlurRequest:this.queryBlurRequest} } },

})
</script>
<script module="navigation" lang="renderjs">
import SpatialNavigation from 'js-spatial-navigation'
export default {
  mounted() { this.initialize() },
  methods: {
  initialize() {
    if(this.root)return
    // renderjs has its own context; it does not expose the logic component's $el.
    const host=(this.latest&&document.getElementById(this.latest.hostId))||document.querySelector('.tv-navigation-host')
    if(!host){if((this.initAttempts=(this.initAttempts||0)+1)<100)setTimeout(()=>this.initialize(),50);return}
    this.root=host.parentElement
    this.root.classList.add('tv-screen')
    const scale=()=>{if(!this.queryHasFocus())this.root.style.setProperty('--tv-unit',Math.min(window.innerWidth/960,window.innerHeight/540)+'px')}
    scale(); window.addEventListener('resize',scale)
    SpatialNavigation.init(); SpatialNavigation.pause()
    // move() works while paused: pause only disables the library's global key handlers.
    this.section='tv-'+Math.random().toString(36).slice(2)
    SpatialNavigation.add(this.section,{selector:[],enterTo:'last-focused',restrict:'self-only'})
    this.pressed=false;this.deferredSelect=null;this.lastMove=0;this.active=this.latest?this.latest.active:true;this.native=false
    this.handle=(key,phase)=>{
      if(!this.active)return
      const select=[23,66,160,13].includes(key)
      if(select){
        if(phase==='down'&&!this.pressed){
          this.pressed=true
          const el=document.activeElement
          if(el&&this.root.contains(el)){
            // Open the IME after OK is released so its repeats stay on the TV button.
            if(el.getAttribute('data-tv-id')==='system-input')this.deferredSelect=el
            else el.click()
          }
        }else if(phase==='up'){
          const el=this.deferredSelect
          this.pressed=false;this.deferredSelect=null
          if(el===document.activeElement)el?.click()
        }
      }else if(phase==='down'){
        const direction=({19:'up',20:'down',21:'left',22:'right',37:'left',38:'up',39:'right',40:'down'})[key]
        if(direction&&Date.now()-this.lastMove>=100){this.lastMove=Date.now();this.refresh();SpatialNavigation.move(direction);this.remember()}
      }
    }
    this.browserDown=event=>{if(/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName||''))return;if([13,19,20,21,22,23,37,38,39,40,66,160].includes(event.keyCode)){event.preventDefault();event.stopImmediatePropagation();this.handle(event.keyCode,'down')}}
    this.browserUp=event=>{if(/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName||'')){if([13,23,66,160].includes(event.keyCode)){this.pressed=false;this.deferredSelect=null}return}if([13,19,20,21,22,23,37,38,39,40,66,160].includes(event.keyCode)){event.preventDefault();event.stopImmediatePropagation();this.handle(event.keyCode,'up')}}
    document.addEventListener('keydown',this.browserDown,true);document.addEventListener('keyup',this.browserUp,true)
    this.focused=event=>{if(this.queryHasFocus()){this.pressed=false;return}if(this.root.contains(event.target)){this.remember();event.target.scrollIntoView({block:'nearest',inline:'nearest'})}}
    this.root.addEventListener('focusin',this.focused)
    this.root.addEventListener('focusout',event=>{if(event.target.closest('.tv-query'))requestAnimationFrame(()=>this.refresh())})
    this.root.addEventListener('click',event=>{
      if(this.active&&event.target.closest('[data-tv-id="system-input"]'))this.root.querySelector('.tv-query input')?.focus()
    },true)
    this.observer=new MutationObserver(()=>{if(!this.scheduled){this.scheduled=true;requestAnimationFrame(()=>{this.scheduled=false;this.refresh()})}})
    this.observer.observe(this.root,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','aria-disabled']})
    this.refresh()
  },
    queryHasFocus(){const el=document.activeElement;return el&&this.root.contains(el)&&!!el.closest('.tv-query')},
    remember(){const el=document.activeElement;if(el&&this.root.contains(el)&&!this.queryHasFocus())this.saved=el.getAttribute('data-tv-focus')},
    refresh(){
      if(!this.root||!this.active)return
      const modal=this.root.querySelector('.picker-sheet,.tv-modal,[role="dialog"]'), scope=modal||this.root
      if(modal!==this.modal){if(modal)this.beforeModal=this.saved;else if(this.modal)this.saved=this.beforeModal;this.modal=modal}
      const elements=[...scope.querySelectorAll('button,uni-button,input,uni-input input,[data-tv-focusable]')].filter(el=>!el.closest('.tv-query')&&!el.disabled&&!(el.hasAttribute('disabled')&&el.getAttribute('disabled')!=='false')&&el.getAttribute('aria-disabled')!=='true'&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden')
      const keys={}
      elements.forEach(el=>{
        const base=el.getAttribute('data-tv-id')||el.id||el.getAttribute('placeholder')||(el.textContent||'').trim().slice(0,100)
        keys[base]=(keys[base]||0)+1
        el.setAttribute('data-tv-focus',base+':'+keys[base]);el.setAttribute('tabindex','-1')
      })
      SpatialNavigation.set(this.section,{selector:elements})
      if(this.queryHasFocus())return
      const requested=this.pendingFocus&&elements.find(el=>el.getAttribute('data-tv-id')===this.pendingFocus.id)
      if(requested){SpatialNavigation.focus(requested);this.pendingFocus=null;this.remember();return}
      const focused=document.activeElement
      if(!elements.includes(focused)){
        const target=elements.find(el=>el.getAttribute('data-tv-focus')===this.saved)||(!modal&&elements.find(el=>el.getAttribute('data-tv-default')==='true'))||elements[0]
        if(target){SpatialNavigation.focus(target);this.remember()}
      }
    },
    update(value){
      this.latest=value
      if(value.focusRequest&&value.focusRequest.token!==this.focusToken){this.focusToken=value.focusRequest.token;this.pendingFocus=value.focusRequest}
      if(!this.root)this.initialize()
      this.active=value.active
      if(!this.root)return
      if(value.queryBlurRequest&&value.queryBlurRequest!==this.queryBlurRequest){
        this.queryBlurRequest=value.queryBlurRequest
        if(this.queryHasFocus())document.activeElement.blur()
      }
      this.root.classList.add('tv-screen')
      if(value.active){this.refresh()}
      else{this.pressed=false;this.deferredSelect=null;this.remember()}
    },
  },
}
</script>
<style>.tv-navigation-host{position:fixed;width:0;height:0;pointer-events:none}</style>
