import { AbortController } from '@/platform/cancellation'
import { utf8Bytes } from '@/domain/http-url'
export class RequestError extends Error {
  constructor(message: string, public code: 'offline' | 'timeout' | 'abort' | 'http' | 'format', public status?: number) { super(message) }
}
export interface HttpResponse { status: number; text: string; headers: Record<string, string> }
export async function requestText(url: string, options: { signal?: AbortSignal; timeout?: number; headers?: Record<string, string>; maxBytes?: number } = {}): Promise<HttpResponse> {
  if (options.signal?.aborted) throw new RequestError('请求已取消', 'abort')
  let target = url
  // #ifdef H5
  if (import.meta.env?.DEV) target = '/__source/' + encodeURIComponent(url)
  // #endif
  const timeout = Math.max(1, options.timeout ?? 8000), maxBytes = options.maxBytes ?? 2 * 1024 * 1024
  if (typeof uni !== 'undefined' && uni.request) return new Promise((resolve, reject) => {
    let settled = false
    const finish = (error?: Error, value?: HttpResponse) => { if (settled) return; settled = true; options.signal?.removeEventListener('abort', abort); error ? reject(error) : resolve(value!) }
    const abort = () => { task.abort(); finish(new RequestError('请求已取消', 'abort')) }
    const task = uni.request({ url: target, timeout, header: options.headers, dataType: 'text', responseType: 'text',
      success: response => {
        const text = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
        if (utf8Bytes(text).length > maxBytes) { finish(new RequestError('返回数据过大', 'format')); return }
        const headers: Record<string, string> = {}; Object.entries(response.header || {}).forEach(([key, value]) => { headers[key.toLowerCase()] = String(value) })
        finish(undefined, { status: response.statusCode, text, headers })
      }, fail: error => finish(new RequestError(/timeout/i.test(error.errMsg) ? '请求超时' : '网络请求失败', /timeout/i.test(error.errMsg) ? 'timeout' : 'http')),
    })
    options.signal?.addEventListener('abort', abort, { once: true })
    if (options.signal?.aborted) abort()
  })
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout)
  const abort = () => controller.abort(); options.signal?.addEventListener('abort', abort, { once: true })
  try {
    const response = await fetch(target, { signal: controller.signal, headers: options.headers })
    if (Number(response.headers.get('content-length')) > maxBytes) throw new RequestError('返回数据过大', 'format')
    const text = await response.text(); if (utf8Bytes(text).length > maxBytes) throw new RequestError('返回数据过大', 'format')
    const headers: Record<string, string> = {}; response.headers.forEach((value, key) => { headers[key] = value })
    return { status: response.status, text, headers }
  } catch (error) { if (options.signal?.aborted) throw new RequestError('请求已取消', 'abort'); if (controller.signal.aborted) throw new RequestError('请求超时', 'timeout'); throw error }
  finally { clearTimeout(timer); options.signal?.removeEventListener('abort', abort) }
}
