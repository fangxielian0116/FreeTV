<script setup lang="ts">
import { onLaunch, onShow, onHide } from '@dcloudio/uni-app'
import { bootstrap, restoreNativeProgress } from '@/services/bootstrap'
import { TV_BUILD } from '@/platform/target'
import { setTitleForeground } from '@/services/title-index'
onLaunch(bootstrap)
onShow(()=>{restoreNativeProgress();if(TV_BUILD)setTitleForeground(true)})
onHide(()=>{if(TV_BUILD)setTitleForeground(false)})
</script>

<style>
@import '@/styles/tv.css';
page { --ft-bg:#eff6fa; --ft-surface:#ffffff; --ft-text:#1c3547; --ft-muted:#607786; --ft-accent:#237da8; --ft-accent-dark:#1c668a; --ft-soft:#dceef5; --ft-border:#d3e4eb; --ft-error:#a1483b; --ft-error-bg:#fff0ed; background:var(--ft-bg); color:var(--ft-text); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif; font-size:15px; line-height:1.6; }
view, text, button, input, textarea { box-sizing: border-box; }
page button { margin: 0; font: inherit; border-radius: 10px; line-height: 1.4; }
page button::after { border: none; }
page button:focus-visible, input:focus-visible, textarea:focus-visible { outline: 2px solid var(--ft-accent); outline-offset: 3px; }
button[disabled] { opacity: .55; }
.screen { width: 100%; max-width: 720px; margin: 0 auto; padding: 24px 24px calc(28px + env(safe-area-inset-bottom)); }
.row { display: flex; align-items: center; }
.between { justify-content: space-between; }
.muted { color: var(--ft-muted); }
.eyebrow { display: block; font-size: 11px; font-weight: 600; letter-spacing: 1.5px; color: var(--ft-accent); }
.title { display: block; font-size: 24px; font-weight: 650; letter-spacing: -.5px; }
.section-heading { margin: 30px 0 14px; }
.section-title { font-size: 17px; font-weight: 650; }
.card { background: var(--ft-surface); border: 1px solid var(--ft-border); border-radius: 12px; padding: 20px; }
.primary { background: var(--ft-accent); color: #fff; padding: 15px 22px; font-weight: 600; text-align: center; }
.secondary { background: var(--ft-soft); color: var(--ft-accent-dark); padding: 12px 17px; }
.quiet { background: transparent; color: var(--ft-accent-dark); font-size: 13px; padding: 8px 0 8px 12px; }
.field { width: 100%; background: var(--ft-surface); border: 1px solid var(--ft-border); border-radius: 9px; padding: 12px 14px; color: var(--ft-text); font-size: 14px; min-height: 48px; }
.field-label { display: block; margin: 16px 0 7px; font-size: 12px; color: var(--ft-muted); }
.hint { display: block; font-size: 12px; color: var(--ft-muted); line-height: 1.7; }
.notice { padding: 12px 15px; border-radius: 9px; background: var(--ft-soft); color: var(--ft-accent-dark); font-size: 12px; line-height: 1.75; }
.error { color: var(--ft-error); background: var(--ft-error-bg); }
.pill { display: inline-flex; align-items: center; background: var(--ft-soft); color: var(--ft-accent-dark); border-radius: 20px; padding: 4px 10px; font-size: 11px; white-space: nowrap; }
.divider { height: 1px; background: var(--ft-border); margin: 20px 0; }
.link-text { word-break: break-all; font-size: 12px; color: var(--ft-accent-dark); }
@media (max-width: 380px) { .screen { padding-left: 17px; padding-right: 17px; } }
</style>
