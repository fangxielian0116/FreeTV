export function notify(message: string) { uni.showToast({ title: message, icon: 'none', duration: 2600 }) }
export function formatTime(seconds: number) { const value = Math.max(0, Math.floor(seconds)); return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}` }
