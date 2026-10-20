import { describe, expect, it } from 'vitest'
import { normalizePayload, pickFields } from '../../src/lib/ai/schema'

describe('pickFields', () => {
  it('keeps known fields and reports unknown ones instead of trusting them', () => {
    const { fields, ignoredKeys } = pickFields({ unitCost: 60000, hargaJual: 250000, evil: '<script>' })
    expect(fields).toEqual({ unitCost: 60000 })
    expect(ignoredKeys).toEqual(['hargaJual', 'evil'])
  })

  it('accepts rupiah written as a string', () => {
    expect(pickFields({ unitCost: 'Rp 60.000' }).fields.unitCost).toBe(60000)
    expect(pickFields({ unitCost: '60000' }).fields.unitCost).toBe(60000)
    expect(pickFields({ unitCost: '60_000' }).fields.unitCost).toBe(60000)
  })

  it('rejects values a human would have to correct anyway', () => {
    expect(pickFields({ unitCost: -5 }).fields.unitCost).toBeUndefined()
    expect(pickFields({ unitCost: 'enam puluh ribu' }).fields.unitCost).toBeUndefined()
    expect(pickFields({ quantity: 0 }).fields.quantity).toBeUndefined()
    expect(pickFields({ quantity: 2.5 }).fields.quantity).toBeUndefined()
    expect(pickFields({ unitCost: 1e13 }).fields.unitCost).toBeUndefined()
  })

  it('drops one bad field without losing the rest', () => {
    const { fields } = pickFields({ unitCost: 'gratis', quantity: 25, title: 'Hampers' })
    expect(fields).toEqual({ quantity: 25, title: 'Hampers' })
  })

  it('drops explicit nulls so an empty answer never overwrites the form', () => {
    expect(pickFields({ unitCost: null, title: null }).fields).toEqual({})
  })

  it('survives junk instead of throwing', () => {
    expect(pickFields(null).fields).toEqual({})
    expect(pickFields('unitCost=5').fields).toEqual({})
    expect(pickFields([1, 2]).fields).toEqual({})
  })

  it('accepts decimal hours and percents', () => {
    expect(pickFields({ serviceHours: '7,5' }).fields.serviceHours).toBe(7.5)
    expect(pickFields({ marginPercent: '27.25' }).fields.marginPercent).toBe(27.25)
  })
})

describe('normalizePayload', () => {
  it('re-validates what the API returned before the UI sees it', () => {
    const normalized = normalizePayload({
      mock: false,
      mode: 'goods',
      fields: { unitCost: 60000, nonsense: 1 } as unknown as Record<string, string | number>,
      assumptions: ['Kemasan dihitung per unit'],
      missing: ['Ongkir'],
      deadline: '12 hari',
      redactedCount: 2,
      remaining: 1,
    })
    expect(normalized.fields).toEqual({ unitCost: 60000 })
    expect(normalized.ignoredKeys).toEqual(['nonsense'])
    expect(normalized.remaining).toBe(1)
    expect(normalized.redactedCount).toBe(2)
    expect(normalized.deadline).toBe('12 hari')
  })
})
