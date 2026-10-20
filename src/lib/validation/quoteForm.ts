import { z } from 'zod'
import type { PricingInput } from '../pricing/types'
import { DEFAULT_VALUES, type QuoteFormValues } from '../../features/quotation/defaults'

export function validateQuoteForm(values: QuoteFormValues): { input?: PricingInput; errors: Partial<Record<keyof QuoteFormValues, string>> } {
  const errors: Partial<Record<keyof QuoteFormValues, string>> = {}
  const number = (key: keyof QuoteFormValues, max: number, decimals = false, min = 0): number => {
    const raw = String(values[key]).trim().replace(',', '.')
    if (!(decimals ? /^\d+(?:\.\d{1,2})?$/ : /^\d+$/).test(raw)) {
      errors[key] = decimals ? 'Isi angka positif, maksimal 2 desimal.' : 'Isi rupiah/angka bulat tanpa titik, koma, atau huruf.'
      return 0
    }
    const parts = raw.split('.')
    const scaled = Number(parts[0]) * 100 + Number((parts[1] ?? '').padEnd(2, '0'))
    const parsed = decimals ? scaled / 100 : Number(raw)
    if (!Number.isSafeInteger(scaled) || parsed < min || parsed > max) errors[key] = `Isi angka antara ${min} dan ${max}.`
    return parsed
  }
  const text = (key: keyof QuoteFormValues, max: number, required = false) => {
    const value = String(values[key])
    if (value.length > max) errors[key] = `Maksimal ${max} karakter.`
    if (required && !value.trim()) errors[key] = 'Nama item wajib diisi.'
    if (Array.from(value).some((character) => { const code = character.charCodeAt(0); return code < 32 && ![9, 10, 13].includes(code) })) errors[key] = 'Hapus karakter kontrol dari teks.'
  }
  const mode = values.mode
  const titleKey = mode === 'goods' ? 'goodsTitle' : mode === 'service' ? 'serviceTitle' : 'customTitle'
  text(titleKey, 120, true)
  text('businessName', 120); text('customerName', 120); text('notes', 1500)
  number('validDays', 365)
  const marginBps = Math.round(number('marginPercent', 80, true) * 100)
  const feeBps = Math.round(number('feePercent', 99, true) * 100)
  if (marginBps + feeBps >= 10000) errors.feePercent = 'Margin + fee harus kurang dari 100%.'
  const rounding = Number(values.rounding)
  if (![100, 500, 1000].includes(rounding)) errors.rounding = 'Pilih pembulatan yang tersedia.'
  const input: PricingInput = {
    mode, quantity: mode === 'service' ? 1 : number(mode === 'custom' ? 'customQuantity' : 'quantity', 1000000, false, 1),
    unitCost: mode === 'goods' ? number('unitCost', 1e12) : 0,
    additionalUnitCost: mode === 'goods' ? number('additionalUnitCost', 1e12) : 0,
    serviceHours: mode === 'service' ? number('serviceHours', 1e6, true, 0.01) : 1,
    hourlyCost: mode === 'service' ? number('hourlyCost', 1e12) : 0,
    subcontractorCost: mode === 'service' ? number('subcontractorCost', 1e12) : 0,
    materialCost: mode === 'custom' ? number('materialCost', 1e12) : 0,
    laborCost: mode === 'custom' ? number('laborCost', 1e12) : 0,
    finishingCost: mode === 'custom' ? number('finishingCost', 1e12) : 0,
    wasteBps: mode === 'custom' ? Math.round(number('wastePercent', 100, true) * 100) : 0,
    fixedCosts: number('fixedCosts', 1e12), fixedFee: number('fixedFee', 1e12), feeBps, marginBps,
    rounding: rounding as 100 | 500 | 1000,
    discount: { type: values.discountType, value: values.discountType === 'percent' ? number('discountValue', 100, true) : number('discountValue', 1e12) },
  }
  return Object.keys(errors).length ? { errors } : { input, errors }
}

const rawShape = Object.fromEntries(Object.entries(DEFAULT_VALUES).map(([key, value]) => [key, typeof value === 'boolean' ? z.boolean() : z.string().max(2000)]))
export const persistedValuesSchema = z.object(rawShape).extend({ mode: z.enum(['goods', 'service', 'custom']), discountType: z.enum(['percent', 'fixed']), persistPersonal: z.boolean() }).strict()
export const formSchema = z.custom<QuoteFormValues>().superRefine((values, ctx) => {
  for (const [key, message] of Object.entries(validateQuoteForm(values).errors)) ctx.addIssue({ code: 'custom', path: [key], message })
})
