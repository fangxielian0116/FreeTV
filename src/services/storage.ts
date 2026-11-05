const memory = new Map<string, unknown>()
export function readLocal<T>(key: string): T | undefined {
  try { return ((typeof uni !== 'undefined' ? uni.getStorageSync(key) : memory.get(key)) || undefined) as T | undefined } catch { return undefined }
}
export function writeLocal(key: string, value: unknown) {
  try { if (typeof uni !== 'undefined') uni.setStorageSync(key, value); else memory.set(key, value) } catch { throw new Error('本机记录保存失败，请检查可用空间') }
}
export function removeLocal(key: string) { if (typeof uni !== 'undefined') uni.removeStorageSync(key); else memory.delete(key) }
export function clearLegacyData() {
  const marker = 'freetv:v3:initialized'
  if (readLocal(marker)) return
  const keys = typeof uni !== 'undefined' ? uni.getStorageInfoSync().keys : [...memory.keys()]
  for (const key of keys) if (key.startsWith('freetv:') && !key.startsWith('freetv:v3:')) removeLocal(key)
  writeLocal(marker, Date.now())
}
