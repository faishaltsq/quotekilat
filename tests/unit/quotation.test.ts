import { describe, expect, it } from 'vitest'
import { createQuote, formatWhatsApp, type QuoteDetails } from '../../src/lib/quotation/quote'
import type { PricingResult } from '../../src/lib/pricing/types'

const details: QuoteDetails = {
  title: 'Cetak katalog',
  businessName: 'Usaha Nusantara',
  customerName: 'José Wijaya',
  notes: 'Pengiriman setelah persetujuan.',
  validDays: 7,
}

const pricing: PricingResult = {
  baseCost: 175000,
  minimumPrice: 250000,
  roundedPrice: 250000,
  discountAmount: 25000,
  finalPrice: 225000,
  sellingFees: 11250,
  profit: 38750,
  actualMarginBps: 1722,
  belowTarget: true,
  unitPrice: 75000,
  costLines: [{ label: 'BIAYA RAHASIA', amount: 175000 }],
}

describe('quotation snapshot', () => {
  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])('rejects invalid customer quantities (%s) instead of exporting a fake average', (quantity) => {
    for (const mode of ['goods', 'custom'] as const) {
      expect(() => createQuote(details, mode, quantity, pricing)).toThrow(/Kuantitas/)
    }
  })

  it.each([-1, 1.5, 366, Number.NaN])('rejects invalid calendar validity (%s)', (validDays) => {
    expect(() => createQuote({ ...details, validDays }, 'goods', 3, pricing)).toThrow(/Masa berlaku/)
  })

  it('rejects a blank item title before creating an exportable quotation', () => {
    expect(() => createQuote({ ...details, title: '  ' }, 'goods', 3, pricing)).toThrow(/Nama item/)
  })

  it.each(['roundedPrice', 'discountAmount', 'finalPrice'] as const)('rejects a non-IDR %s instead of formatting NaN', (field) => {
    expect(() => createQuote(details, 'goods', 3, { ...pricing, [field]: Number.NaN })).toThrow(/Harga/)
    expect(() => createQuote(details, 'goods', 3, { ...pricing, [field]: -1 })).toThrow(/Harga/)
    expect(() => createQuote(details, 'goods', 3, { ...pricing, [field]: 0.5 })).toThrow(/Harga/)
  })

  it('represents a service order as one customer-facing package, not internal hours', () => {
    expect(createQuote(details, 'service', 12, pricing).quantity).toBe(1)
  })

  it('captures an independent immutable snapshot with a cryptographic dated quote number', () => {
    const inputDetails = { ...details }
    const inputPricing = { ...pricing, costLines: pricing.costLines.map((line) => ({ ...line })) }
    const now = new Date('2026-10-20T16:45:00.000Z')
    const quote = createQuote(inputDetails, 'goods', 3, inputPricing, now)

    expect(quote).toMatchObject({
      createdAt: '2026-10-20T16:45:00.000Z',
      details,
      mode: 'goods',
      quantity: 3,
      pricing,
    })
    expect(quote.id).toMatch(/^QK-20261020-[A-F0-9]{12}$/)
    expect(createQuote(details, 'goods', 3, pricing, now).id).not.toBe(quote.id)
    inputDetails.title = 'Changed draft'
    inputPricing.finalPrice = 1
    inputPricing.costLines[0].label = 'Changed internal cost'
    now.setUTCDate(21)
    expect(quote.details.title).toBe('Cetak katalog')
    expect(quote.pricing.finalPrice).toBe(225000)
    expect(quote.pricing.costLines[0].label).toBe('BIAYA RAHASIA')
    expect(quote.createdAt).toBe('2026-10-20T16:45:00.000Z')
    expect(Object.isFrozen(quote)).toBe(true)
    expect(Object.isFrozen(quote.details)).toBe(true)
    expect(Object.isFrozen(quote.pricing)).toBe(true)
    expect(Object.isFrozen(quote.pricing.costLines)).toBe(true)
    expect(Object.isFrozen(quote.pricing.costLines[0])).toBe(true)
  })
})

describe('WhatsApp quotation', () => {
  it('labels a fractional average as an approximation rather than an exact unit price', () => {
    const quote = createQuote(details, 'goods', 3, { ...pricing, finalPrice: 100000, unitPrice: 100000 / 3 })
    expect(formatWhatsApp(quote)).toContain('Harga rata-rata/unit: Rp33.333,33 (perkiraan)')
    expect(formatWhatsApp(quote)).toContain('Total: Rp100.000')
  })

  it('uses the captured identity and customer-facing amounts without exposing internal finances', () => {
    const quote = createQuote(details, 'goods', 3, pricing, new Date('2026-10-20T16:45:00.000Z'))
    const text = formatWhatsApp(quote)
    expect(text).toContain(quote.id)
    expect(text).toContain('20 Oktober 2026')
    expect(text).toContain('27 Oktober 2026')
    expect(text).toContain('7 hari')
    expect(text).toContain('Usaha Nusantara')
    expect(text).toContain('José Wijaya')
    expect(text).toContain('Cetak katalog')
    expect(text).toContain('Jumlah: 3 unit')
    expect(text).toContain('Harga rata-rata/unit: Rp75.000')
    expect(text).toContain('Subtotal (dibulatkan): Rp250.000')
    expect(text).toContain('Diskon: Rp25.000')
    expect(text).toContain('Total: Rp225.000')
    expect(text).toContain('Pengiriman setelah persetujuan.')
    expect(text).toContain('Belum termasuk pajak')
    expect(text).not.toMatch(/BIAYA RAHASIA|175[.\s]?000|11[.\s]?250|38[.\s]?750|modal|margin|profit|sellingFees|belowTarget/i)
    expect(formatWhatsApp(quote)).toBe(text)
  })
})
