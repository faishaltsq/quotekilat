import { describe, expect, it } from 'vitest'
import {
  cloudQuoteToPricing,
  isUuid,
  toSaveQuotePayload,
  type CloudQuote,
  type SaveQuoteSource,
} from '../../src/lib/cloud/quoteMapping'
import type { PricingResult } from '../../src/lib/pricing/types'

const KEY = 'aaaaaaaa-0000-4000-8000-000000000001'

const pricing: PricingResult = {
  baseCost: 175000,
  minimumPrice: 250000,
  roundedPrice: 250000,
  discountAmount: 0,
  finalPrice: 250000,
  sellingFees: 0,
  profit: 75000,
  actualMarginBps: 3000,
  belowTarget: false,
  unitPrice: 250000,
  costLines: [
    { label: 'Biaya utama', amount: 150000 },
    { label: 'Biaya tambahan', amount: 25000 },
  ],
}

const source: SaveQuoteSource = {
  details: { title: '  Hampers custom  ', customerName: '  Budi  ' },
  mode: 'goods',
  quantity: 1,
  targetMarginBps: 3000,
  pricing,
}

describe('toSaveQuotePayload', () => {
  it('maps the customer-facing price and never leaks internal cost lines', () => {
    const payload = toSaveQuotePayload(source, KEY)
    expect(payload.computedPriceIdr).toBe(250000)
    expect(payload.kind).toBe('goods')
    expect(payload.title).toBe('Hampers custom')
    expect(payload.customerName).toBe('Budi')
    expect(payload.targetMarginBps).toBe(3000)
    expect(payload.actualMarginBps).toBe(3000)
    expect(payload.discountAmountIdr).toBe(0)
    expect(JSON.stringify(payload)).not.toContain('costLines')
    expect(JSON.stringify(payload)).not.toContain('Biaya utama')
  })

  it('keeps the chosen target margin instead of deriving it from profit', () => {
    // A below-target quote: actual margin 10% while the user asked for 30%.
    const belowTarget = { ...pricing, profit: 25000, actualMarginBps: 1000, belowTarget: true }
    const payload = toSaveQuotePayload({ ...source, targetMarginBps: 3000, pricing: belowTarget }, KEY)
    expect(payload.targetMarginBps).toBe(3000)
    expect(payload.actualMarginBps).toBe(1000)
    expect(payload.costBreakdown.belowTarget).toBe(true)
  })

  it('forces service orders to a single unit', () => {
    const payload = toSaveQuotePayload({ ...source, mode: 'service', quantity: 12 }, KEY)
    expect(payload.items).toEqual([{ title: 'Hampers custom', quantity: 1 }])
  })

  it('keeps the entered quantity for goods and custom', () => {
    expect(toSaveQuotePayload({ ...source, quantity: 7 }, KEY).items).toEqual([
      { title: 'Hampers custom', quantity: 7 },
    ])
    expect(toSaveQuotePayload({ ...source, mode: 'custom', quantity: 3 }, KEY).items).toEqual([
      { title: 'Hampers custom', quantity: 3 },
    ])
  })

  it('omits a blank customer name rather than storing an empty string', () => {
    const payload = toSaveQuotePayload(
      { ...source, details: { title: 'Hampers', customerName: '   ' } },
      KEY,
    )
    expect(payload.customerName).toBeNull()
  })

  it('rejects an empty title, a zero price, a bad margin and a non-UUID key', () => {
    expect(() => toSaveQuotePayload({ ...source, details: { title: '  ', customerName: '' } }, KEY)).toThrow()
    expect(() =>
      toSaveQuotePayload({ ...source, pricing: { ...pricing, finalPrice: 0 } }, KEY),
    ).toThrow()
    expect(() => toSaveQuotePayload({ ...source, targetMarginBps: 10001 }, KEY)).toThrow()
    expect(() => toSaveQuotePayload({ ...source, targetMarginBps: -1 }, KEY)).toThrow()
    expect(() => toSaveQuotePayload({ ...source, targetMarginBps: 30.5 }, KEY)).toThrow()
    expect(() => toSaveQuotePayload(source, 'not-a-uuid')).toThrow()
  })

  it('truncates overlong text to the column limits', () => {
    const payload = toSaveQuotePayload(
      { ...source, details: { title: 'x'.repeat(200), customerName: 'y'.repeat(200) } },
      KEY,
    )
    expect(payload.title).toHaveLength(120)
    expect(payload.customerName).toHaveLength(120)
  })

  it('rounds a fractional actual margin to whole basis points', () => {
    const payload = toSaveQuotePayload(
      { ...source, pricing: { ...pricing, actualMarginBps: 2999.7 } },
      KEY,
    )
    expect(payload.actualMarginBps).toBe(3000)
  })

  it('stores a null actual margin when revenue is undefined', () => {
    const payload = toSaveQuotePayload({ ...source, pricing: { ...pricing, actualMarginBps: null } }, KEY)
    expect(payload.actualMarginBps).toBeNull()
  })
})

describe('isUuid', () => {
  it.each([
    ['aaaaaaaa-0000-4000-8000-000000000001', true],
    ['AAAAAAAA-0000-4000-8000-000000000001', true],
    ['aaaaaaaa-0000-4000-8000-00000000000', false],
    ['aaaaaaaa000040008000000000000001', false],
    ['not-a-uuid', false],
    ['', false],
  ])('%s -> %s', (value, expected) => {
    expect(isUuid(value)).toBe(expected)
  })
})

describe('cloudQuoteToPricing', () => {
  const row: CloudQuote = {
    id: 'q1',
    owner_id: 'u1',
    business_profile_id: null,
    customer_name: 'Budi',
    kind: 'goods',
    title: 'Hampers custom',
    items: [{ title: 'Hampers custom', quantity: 2 }],
    cost_breakdown: { baseCost: 175000, roundedPrice: 250000, sellingFees: 0, belowTarget: false },
    target_margin_bps: 3000,
    computed_price_idr: 500000,
    actual_margin_bps: 6500,
    discount_amount_idr: 0,
    status: 'draft',
    quoted_at: '2026-10-20T00:00:00.000Z',
    created_at: '2026-10-20T00:00:00.000Z',
    updated_at: '2026-10-20T00:00:00.000Z',
    idempotency_key: KEY,
  }

  it('reconstructs price, profit and unit price from the stored breakdown', () => {
    const result = cloudQuoteToPricing(row)
    expect(result.finalPrice).toBe(500000)
    expect(result.baseCost).toBe(175000)
    expect(result.profit).toBe(325000)
    expect(result.unitPrice).toBe(250000)
    expect(result.costLines).toEqual([])
  })

  it('tolerates a malformed items array without dividing by zero', () => {
    const result = cloudQuoteToPricing({ ...row, items: [] })
    expect(result.unitPrice).toBe(500000)
    expect(Number.isFinite(result.unitPrice)).toBe(true)
  })
})
