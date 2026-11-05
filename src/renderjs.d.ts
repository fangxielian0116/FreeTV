import '@vue/runtime-core'
declare module '@vue/runtime-core' {
  interface ComponentCustomProperties { navigation: {update: (value: unknown) => void} }
}
