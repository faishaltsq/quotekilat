/**
 * A closed event vocabulary. Anything not listed here cannot be recorded, which
 * is what keeps a future contributor from shipping `customer_name` as a
 * property by accident.
 */
export const ALLOWED_EVENTS = [
  'quote_completed',
  'pdf_downloaded',
  'whatsapp_copied',
  'cloud_quote_saved',
  'smart_input_applied',
  'checkout_started',
  'market_research_run',
  'plan_viewed',
] as const

export type AnalyticsEventName = (typeof ALLOWED_EVENTS)[number]

/** Property keys that may be recorded. Values are additionally capped. */
const ALLOWED_PROPS = new Set(['mode', 'quantity', 'marginBucket', 'plan', 'result', 'source'])
const MAX_VALUE_CHARS = 40

export type AnalyticsEvent = {
  name: AnalyticsEventName
  props: Record<string, string | number>
  ts: string
}

/**
 * Free text is indistinguishable from a customer name at this layer, so any
 * string longer than a short enum label is dropped. Numbers are kept only when
 * they are finite integers.
 */
export function scrubProps(raw: Record<string, unknown>): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (!ALLOWED_PROPS.has(key)) continue
    if (typeof value === 'number') {
      if (Number.isInteger(value) && Math.abs(value) <= 1_000_000) out[key] = value
      continue
    }
    if (typeof value === 'string' && value.length > 0 && value.length <= MAX_VALUE_CHARS) out[key] = value
  }
  return out
}

export function buildEvent(name: AnalyticsEventName, props: Record<string, unknown>): AnalyticsEvent {
  if (!(ALLOWED_EVENTS as readonly string[]).includes(name)) {
    throw new Error(`unknown analytics event: ${name}`)
  }
  return { name, props: scrubProps(props), ts: new Date().toISOString() }
}
