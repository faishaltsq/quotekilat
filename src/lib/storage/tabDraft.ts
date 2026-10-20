import type { QuoteFormValues } from '../../features/quotation/defaults'
let current: QuoteFormValues | null = null
export function loadTabDraft(): { values: QuoteFormValues } | null {
  return current ? { values: { ...current } } : null
}
export function saveTabDraft(values: QuoteFormValues): void { current = { ...values } }
export function clearTabDraft(): void { current = null }
