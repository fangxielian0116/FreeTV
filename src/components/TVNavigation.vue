<template><view v-if="enabled" :id="hostId" class="tv-navigation-host" :prop="state" :change:prop="navigation.update" /></template>
<script lang="ts">
import { defineComponent } from 'vue'
import { TV_BUILD } from '@/platform/target'
export default defineComponent({
  props: { active: {type:Boolean,default:true}, restoreKey: {type:String,default:''}, focusRequest: {type:Object,default:null} },
  data: () => ({enabled:TV_BUILD,hostId:'tv-nav-'+Math.random().toString(36).slice(2),}),
  computed: { state(): object { return {hostId:this.hostId,active:this.active,restoreKey:this.restoreKey,focusRequest:this.focusRequest} } },

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
    const scale=()=>{this.root.style.setProperty('--tv-unit',Math.min(window.innerWidth/960,window.innerHeight/540)+'px')}
    scale(); window.addEventListener('resize',scale)
    SpatialNavigation.init(); SpatialNavigation.pause()
    // move() works while paused: pause only disables the library's global key handlers.
    this.section='tv-'+Math.random().toString(36).slice(2)
    SpatialNavigation.add(this.section,{selector:[],enterTo:'last-focused',restrict:'self-only'})
    this.pressed=false;this.lastMove=0;this.active=this.latest?this.latest.active:true;this.native=false
    this.handle=(key,phase)=>{
      if(!this.active)return
      const select=[23,66,160,13].includes(key)
      if(select){
        if(phase==='down'){if(!this.pressed){this.pressed=true;const el=document.activeElement;if(el&&this.root.contains(el))el.click()}}
        else this.pressed=false
      }else if(phase==='down'){
        const direction=({19:'up',20:'down',21:'left',22:'right',37:'left',38:'up',39:'right',40:'down'})[key]
        if(direction&&Date.now()-this.lastMove>=100){this.lastMove=Date.now();this.refresh();SpatialNavigation.move(direction);this.remember()}
      }
    }
    this.browserDown=event=>{if(/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName||''))return;if([13,19,20,21,22,23,37,38,39,40,66,160].includes(event.keyCode)){event.preventDefault();event.stopImmediatePropagation();this.handle(event.keyCode,'down')}}
    this.browserUp=event=>{if(/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName||''))return;if([13,19,20,21,22,23,37,38,39,40,66,160].includes(event.keyCode)){event.preventDefault();event.stopImmediatePropagation();this.handle(event.keyCode,'up')}}
    document.addEventListener('keydown',this.browserDown,true);document.addEventListener('keyup',this.browserUp,true)
    this.focused=event=>{if(this.root.contains(event.target)){this.remember();event.target.scrollIntoView({block:'nearest',inline:'nearest'})}}
    this.root.addEventListener('focusin',this.focused)
    this.observer=new MutationObserver(()=>{if(!this.scheduled){this.scheduled=true;requestAnimationFrame(()=>{this.scheduled=false;this.refresh()})}})
    this.observer.observe(this.root,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','aria-disabled']})
    this.refresh()
  },
    remember(){const el=document.activeElement;if(el&&this.root.contains(el))this.saved=el.getAttribute('data-tv-focus')},
    refresh(){
      if(!this.root||!this.active)return
      const modal=this.root.querySelector('.picker-sheet,.tv-modal,[role="dialog"]'), scope=modal||this.root
      if(modal!==this.modal){if(modal)this.beforeModal=this.saved;else if(this.modal)this.saved=this.beforeModal;this.modal=modal}
      const elements=[...scope.querySelectorAll('button,uni-button,input,uni-input input,[data-tv-focusable]')].filter(el=>!el.disabled&&!(el.hasAttribute('disabled')&&el.getAttribute('disabled')!=='false')&&el.getAttribute('aria-disabled')!=='true'&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden')
      const keys={}
      elements.forEach(el=>{
        const base=el.getAttribute('data-tv-id')||el.id||el.getAttribute('placeholder')||(el.textContent||'').trim().slice(0,100)
        keys[base]=(keys[base]||0)+1
        el.setAttribute('data-tv-focus',base+':'+keys[base]);el.setAttribute('tabindex','-1')
      })
      SpatialNavigation.set(this.section,{selector:elements})
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
      this.root.classList.add('tv-screen')
      if(value.active){this.refresh()}
      else{this.pressed=false;this.remember()}
    },
  },
}
</script>
<style>.tv-navigation-host{position:fixed;width:0;height:0;pointer-events:none}</style>
