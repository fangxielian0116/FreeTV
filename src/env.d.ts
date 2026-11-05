/// <reference types="vite/client" />
declare const __FREETV_TV__: boolean
declare module '*.injected' { const script: string; export default script }

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}
