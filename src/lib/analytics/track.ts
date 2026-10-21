import { readConsent } from './consent'
import { buildEvent, type AnalyticsEventName } from './events'

/**
 * Fire-and-forget. Never awaited by the caller, never throws, never blocks a
 * user action, and completely silent without consent. `keepalive` lets a
 * navigation to the payment provider still deliver the event.
 */
export function track(name: AnalyticsEventName, props: Record<string, unknown> = {}): void {
  if (readConsent() !== 'granted') return
  let body: string
  try {
    body = JSON.stringify(buildEvent(name, props))
  } catch {
    return
  }
  void fetch('/api/analytics/collect', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => undefined)
}
