class ServiceSignal {
  aborted = false
  reason: unknown
  onabort: ((event: Event) => void) | null = null
  private listeners = new Set<EventListenerOrEventListenerObject>()
  addEventListener(type: string, listener: EventListenerOrEventListenerObject | null) { if (type === 'abort' && listener) this.listeners.add(listener) }
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null) { if (type === 'abort' && listener) this.listeners.delete(listener) }
  abort(reason?: unknown) {
    if (this.aborted) return
    this.aborted = true; this.reason = reason
    const event = { type: 'abort', target: this } as unknown as Event
    this.onabort?.(event)
    for (const listener of this.listeners) typeof listener === 'function' ? listener(event) : listener.handleEvent(event)
    this.listeners.clear()
  }
}
export class ServiceAbortController {
  private state = new ServiceSignal()
  readonly signal = this.state as unknown as AbortSignal
  abort(reason?: unknown) { this.state.abort(reason) }
}
export const AbortController: typeof globalThis.AbortController = (typeof globalThis.AbortController === 'function' ? globalThis.AbortController : ServiceAbortController) as typeof globalThis.AbortController
