const CHINA_OFFSET_MS = 8 * 60 * 60 * 1000
export const chinaYear = (timestamp = Date.now()) => new Date(timestamp + CHINA_OFFSET_MS).getUTCFullYear()
export function formatChinaDateTime(timestamp: number) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '尚未检查'
  const date = new Date(timestamp + CHINA_OFFSET_MS)
  if (!Number.isFinite(date.getTime())) return '尚未检查'
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth()+1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
}
