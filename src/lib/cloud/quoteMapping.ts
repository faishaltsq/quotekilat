import type { PricingResult, QuoteMode } from '../pricing/types'

/** One row of `public.quotes` as the client is allowed to see it. */
export type CloudQuote = {
  id: string
  owner_id: string
  business_profile_id: string | null
  customer_name: string | null
  kind: QuoteMode
  title: string
  items: unknown[]
  cost_breakdown: Record<string, unknown>
  target_margin_bps: number
  computed_price_idr: number
  actual_margin_bps: number | null
  discount_amount_idr: number
  status: 'draft' | 'sent' | 'accepted' | 'expired'
  quoted_at: string
  created_at: string
  updated_at: string
  idempotency_key: string
}

/**
 * The payload sent to `save_quote()`. Field names mirror the RPC arguments so a
 * rename in SQL cannot silently drift from the client.
 */
export type SaveQuotePayload = {
  kind: QuoteMode
  title: string
  items: unknown[]
  costBreakdown: Record<string, unknown>
  targetMarginBps: number
  computedPriceIdr: number
  actualMarginBps: number | null
  discountAmountIdr: number
  customerName: string | null
  businessProfileId: string | null
  idempotencyKey: string
}

export type SaveQuoteSource = {
  details: { title: string; customerName: string }
  mode: QuoteMode
  quantity: number
  /** The user's chosen target margin in basis points — an input, never derived. */
  targetMarginBps: number
  pricing: PricingResult
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value)
}

/**
 * Map a finished quote onto the cloud row.
 *
 * `pricing.costLines` is deliberately excluded: the stored row is read back into
 * a shareable quote, and internal per-line costs must never leave the device.
 */
export function toSaveQuotePayload(source: SaveQuoteSource, idempotencyKey: string): SaveQuotePayload {
  const { details, mode, quantity, targetMarginBps, pricing } = source
  const title = details.title.trim()
  if (!title) throw new Error('Nama item wajib diisi.')
  if (!Number.isSafeInteger(pricing.finalPrice) || pricing.finalPrice <= 0) {
    throw new Error('Harga akhir harus rupiah bulat positif.')
  }
  if (!Number.isInteger(targetMarginBps) || targetMarginBps < 0 || targetMarginBps > 10000) {
    throw new Error('Target margin harus 0 sampai 10000 basis poin.')
  }
  if (!isUuid(idempotencyKey)) throw new Error('Idempotency key harus UUID.')

  const units = mode === 'service' ? 1 : quantity
  return {
    kind: mode,
    title: title.slice(0, 120),
    items: [{ title: title.slice(0, 120), quantity: units }],
    costBreakdown: {
      baseCost: pricing.baseCost,
      roundedPrice: pricing.roundedPrice,
      sellingFees: pricing.sellingFees,
      belowTarget: pricing.belowTarget,
    },
    targetMarginBps,
    computedPriceIdr: pricing.finalPrice,
    actualMarginBps: pricing.actualMarginBps === null ? null : Math.round(pricing.actualMarginBps),
    discountAmountIdr: pricing.discountAmount,
    customerName: details.customerName.trim().slice(0, 120) || null,
    businessProfileId: null,
    idempotencyKey,
  }
}

/**
 * Rebuild the pricing shape a cloud row can reconstruct. Cost lines are absent
 * by design, so `profit` is derived from the stored breakdown rather than guessed.
 */
export function cloudQuoteToPricing(row: CloudQuote): PricingResult {
  const finalPrice = row.computed_price_idr
  const discount = row.discount_amount_idr
  const baseCost = Number(row.cost_breakdown.baseCost ?? 0)
  const sellingFees = Number(row.cost_breakdown.sellingFees ?? 0)
  const units = Math.max(Number((row.items[0] as { quantity?: number } | undefined)?.quantity) || 1, 1)
  return {
    baseCost,
    minimumPrice: finalPrice + discount,
    roundedPrice: Number(row.cost_breakdown.roundedPrice ?? finalPrice + discount),
    discountAmount: discount,
    finalPrice,
    sellingFees,
    profit: finalPrice - baseCost - sellingFees,
    actualMarginBps: row.actual_margin_bps,
    belowTarget: Boolean(row.cost_breakdown.belowTarget),
    unitPrice: finalPrice / units,
    costLines: [],
  }
}
