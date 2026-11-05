import { ref } from 'vue'
import { onShow, onHide, onUnload } from '@dcloudio/uni-app'
export function useTVPage() {
  const tvActive=ref(true)
  onShow(()=>{tvActive.value=true});onHide(()=>{tvActive.value=false});onUnload(()=>{tvActive.value=false})
  return tvActive
}
