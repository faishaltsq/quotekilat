export type RawSource = {
  title: string
  url: string
  priceIdr: number
  unit: string
  observedAt: string
  region: string
  specs: string
}

export type MarketSource = RawSource & { host: string }

export type MarketResult = {
  status: 'ok' | 'insufficient_sources'
  checkedAt: string
  query: string
  sources: MarketSource[]
  observedRange: { minIdr: number; maxIdr: number; count: number } | null
  recommendation: null
  message: string
}

const MIN_COMPARABLES = 3

/**
 * The blueprint forbids presenting a range as a market price. This function is
 * the gate: below three genuine comparables it returns the insufficient state
 * and no numbers at all, so a caller cannot accidentally render a range.
 */
export function buildMarketResult(input: {
  query: string
  sources: RawSource[]
  checkedAt: string
}): MarketResult {
  const usable: MarketSource[] = []
  for (const source of input.sources) {
    if (!/^https:\/\/[^\s]+$/i.test(source.url)) continue
    if (!Number.isInteger(source.priceIdr) || source.priceIdr <= 0) continue
    if (!source.title.trim()) continue
    let host: string
    try { host = new URL(source.url).host } catch { continue }
    usable.push({ ...source, host })
  }

  if (usable.length < MIN_COMPARABLES) {
    return {
      status: 'insufficient_sources',
      checkedAt: input.checkedAt,
      query: input.query,
      sources: usable,
      observedRange: null,
      recommendation: null,
      message: 'Belum cukup referensi harga yang dapat dibandingkan.',
    }
  }

  const prices = usable.map((item) => item.priceIdr)
  return {
    status: 'ok',
    checkedAt: input.checkedAt,
    query: input.query,
    sources: usable,
    observedRange: { minIdr: Math.min(...prices), maxIdr: Math.max(...prices), count: usable.length },
    recommendation: null,
    message: 'Kisaran ini berasal dari penawaran yang ditemukan, bukan harga pasar universal.',
  }
}
