import type { PricingResult, QuoteMode } from '../pricing/types'
import { getCustomerQuoteLines } from './presentation'

const SUFFIX_PATTERN = /^[A-F0-9]{12}$/

/** Random 12-char uppercase hex suffix for a new quote number. */
export function randomQuoteSuffix(): string {
  const random = crypto.getRandomValues(new Uint8Array(6))
  return Array.from(random, (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase()
}

export type QuoteDetails = {
  title: string
  businessName: string
  customerName: string
  notes: string
  /** Calendar days after the quotation date; zero omits the expiry date. */
  validDays: number
}

export type QuoteSnapshot = {
  readonly id: string
  readonly createdAt: string
  readonly details: QuoteDetails
  readonly mode: QuoteMode
  readonly quantity: number
  readonly pricing: PricingResult
}

/** Capture once and share this object between the preview and every export. */
export function createQuote(
  details: QuoteDetails,
  mode: QuoteMode,
  quantity: number,
  pricing: PricingResult,
  now: Date = new Date(),
  /** Pass a stable suffix to keep one invoice number across live re-renders. */
  idSuffix: string = randomQuoteSuffix(),
): QuoteSnapshot {
  if (!SUFFIX_PATTERN.test(idSuffix)) {
    throw new Error('Sufiks nomor penawaran harus 12 karakter heksadesimal A–F/0–9.')
  }
  if (!details.title.trim()) throw new Error('Nama item wajib diisi.')
  if (!Number.isInteger(details.validDays) || details.validDays < 0 || details.validDays > 365) {
    throw new Error('Masa berlaku harus berupa 0 sampai 365 hari.')
  }
  if (mode !== 'service' && (!Number.isSafeInteger(quantity) || quantity <= 0)) {
    throw new Error('Kuantitas harus berupa angka bulat positif yang aman.')
  }
  for (const value of [pricing.roundedPrice, pricing.discountAmount, pricing.finalPrice]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('Harga harus berupa rupiah bulat non-negatif yang aman.')
  }
  const createdAt = now.toISOString()
  const detailsCopy = Object.freeze({ ...details })
  const pricingCopy: PricingResult = {
    ...pricing,
    costLines: pricing.costLines.map((line) => Object.freeze({ ...line })),
  }
  Object.freeze(pricingCopy.costLines)
  Object.freeze(pricingCopy)
  return Object.freeze({
    id: `QK-${createdAt.slice(0, 10).replaceAll('-', '')}-${idSuffix}`,
    createdAt,
    details: detailsCopy,
    mode,
    quantity: mode === 'service' ? 1 : quantity,
    pricing: pricingCopy,
  })
}

/** Plain text only; callers may copy this without transmitting it anywhere. */
export function formatWhatsApp(quote: QuoteSnapshot): string {
  return ['*PENAWARAN*', ...getCustomerQuoteLines(quote)].join('\n')
}
