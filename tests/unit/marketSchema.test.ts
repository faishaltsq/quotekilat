import { describe, expect, it } from 'vitest'
import { buildMarketResult, type RawSource } from '../../src/lib/market/schema'

const source = (overrides: Partial<RawSource> = {}): RawSource => ({
  title: 'Hampers kain 25 pcs',
  url: 'https://contoh.test/hampers',
  priceIdr: 250000,
  unit: 'paket',
  observedAt: '2026-10-01',
  region: 'Jakarta',
  specs: 'kain, 25 pcs',
  ...overrides,
})

describe('buildMarketResult', () => {
  it('reports insufficient sources below three comparables', () => {
    const result = buildMarketResult({ query: 'hampers kain', sources: [source(), source()], checkedAt: '2026-10-21T00:00:00.000Z' })
    expect(result.status).toBe('insufficient_sources')
    expect(result.observedRange).toBeNull()
    expect(result.message).toContain('Belum cukup')
  })

  it('reports a range from three or more comparables', () => {
    const result = buildMarketResult({
      query: 'hampers kain',
      sources: [source(), source({ priceIdr: 300000 }), source({ priceIdr: 275000 })],
      checkedAt: '2026-10-21T00:00:00.000Z',
    })
    expect(result.status).toBe('ok')
    expect(result.observedRange).toEqual({ minIdr: 250000, maxIdr: 300000, count: 3 })
  })

  it('drops a source without a url or a positive price', () => {
    const result = buildMarketResult({
      query: 'x',
      sources: [source(), source({ url: '' }), source({ priceIdr: 0 })],
      checkedAt: '2026-10-21T00:00:00.000Z',
    })
    expect(result.sources).toHaveLength(1)
    expect(result.status).toBe('insufficient_sources')
  })

  it('drops a non-https url', () => {
    const result = buildMarketResult({ query: 'x', sources: [source({ url: 'javascript:alert(1)' })], checkedAt: '2026-10-21T00:00:00.000Z' })
    expect(result.sources).toHaveLength(0)
  })

  it('never returns a recommendation', () => {
    const result = buildMarketResult({
      query: 'x',
      sources: [source(), source(), source()],
      checkedAt: '2026-10-21T00:00:00.000Z',
    })
    expect(result.recommendation).toBeNull()
  })
})
