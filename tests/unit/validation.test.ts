import { describe, expect, it } from 'vitest'
import { DEFAULT_VALUES } from '../../src/features/quotation/defaults'
import { validateQuoteForm } from '../../src/lib/validation/quoteForm'
import { calculatePricing } from '../../src/lib/pricing/pricingEngine'
describe('quote form validation', () => {
  it('converts Indonesian decimals to integer basis points without rounding', () => {
    const result = validateQuoteForm({ ...DEFAULT_VALUES, marginPercent: '30,25' })
    expect(result.input?.marginBps).toBe(3025)
  })
  it('converts discount input to the engine contract and recalculates discounted margin', () => {
    const parsed = validateQuoteForm({ ...DEFAULT_VALUES, unitCost: '100000', additionalUnitCost: '0', marginPercent: '25', feePercent: '5', discountValue: '10' })
    expect(calculatePricing(parsed.input!).finalPrice).toBe(128700)
    expect(calculatePricing(parsed.input!).belowTarget).toBe(true)
  })
  it('rejects pasted nonnumeric money rather than treating it as zero', () => {
    const result = validateQuoteForm({ ...DEFAULT_VALUES, unitCost: 'abc' })
    expect(result.input).toBeUndefined()
    expect(result.errors.unitCost).toBeTruthy()
  })
  it('validates only relevant mode costs and refuses blank title', () => {
    expect(validateQuoteForm({ ...DEFAULT_VALUES, mode: 'service', unitCost: 'abc' }).input).toBeDefined()
    expect(validateQuoteForm({ ...DEFAULT_VALUES, goodsTitle: '   ' }).errors.goodsTitle).toBeTruthy()
  })
  it('uses independent goods and custom quantities', () => {
    const goods = validateQuoteForm({ ...DEFAULT_VALUES, quantity: '3', customQuantity: '7' })
    const custom = validateQuoteForm({ ...DEFAULT_VALUES, mode: 'custom', quantity: '3', customQuantity: '7' })
    expect(goods.input?.quantity).toBe(3)
    expect(custom.input?.quantity).toBe(7)
  })
  it('rejects impossible fee and margin combination', () => {
    expect(validateQuoteForm({ ...DEFAULT_VALUES, marginPercent: '80', feePercent: '20' }).errors.feePercent).toBeTruthy()
  })
  it('rejects negative, fractional IDR and overlong notes', () => {
    for (const value of ['-1', '1.5', '1e5', '', 'Infinity']) {
      expect(validateQuoteForm({ ...DEFAULT_VALUES, unitCost: value }).errors.unitCost).toBeTruthy()
    }
    expect(validateQuoteForm({ ...DEFAULT_VALUES, notes: 'a'.repeat(1501) }).errors.notes).toBeTruthy()
  })
})
