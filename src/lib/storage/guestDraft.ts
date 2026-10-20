import { z } from 'zod'
import { DEFAULT_VALUES, type QuoteFormValues } from '../../features/quotation/defaults'
import { persistedValuesSchema } from '../validation/quoteForm'
export const DRAFT_KEY = 'quotekilat:guest-draft:v1'
const envelope = z.object({ version: z.literal(1), savedAt: z.string().datetime(), values: persistedValuesSchema })
export type SavedDraft = { values: QuoteFormValues; savedAt: string }
export function loadDraft(): SavedDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw || raw.length > 20000) return null
    const parsed = envelope.safeParse(JSON.parse(raw))
    if (!parsed.success) return null
    const values = { ...DEFAULT_VALUES, ...parsed.data.values } as QuoteFormValues
    if (!values.persistPersonal) { values.businessName = ''; values.customerName = ''; values.notes = '' }
    return { values, savedAt: parsed.data.savedAt }
  } catch { return null }
}
export function saveDraft(values: QuoteFormValues): boolean {
  try {
    const safe = { ...values }
    if (!safe.persistPersonal) { safe.businessName = ''; safe.customerName = ''; safe.notes = '' }
    const data = JSON.stringify({ version: 1, savedAt: new Date().toISOString(), values: safe })
    if (data.length > 20000 || !persistedValuesSchema.safeParse(safe).success) return false
    localStorage.setItem(DRAFT_KEY, data)
    return true
  } catch { return false }
}
export function clearDraft(): boolean {
  try { localStorage.removeItem(DRAFT_KEY); return true } catch { return false }
}
