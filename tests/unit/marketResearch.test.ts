import { describe, expect, it, vi } from 'vitest'
import { handleMarketResearch, type MarketDeps } from '../../server/market/research'

const config = { url: 'https://abcd.supabase.co', key: 'sb_publishable_test' }
const search = { baseUrl: 'https://search.example.test/v1', apiKey: 'sk-search-test', model: 'search-model' }

const threeSources = {
  sources: [
    { title: 'Hampers kain 25 pcs', url: 'https://a.test/hampers', priceIdr: 250000, unit: 'paket', observedAt: '2026-10-01', region: 'Jakarta', specs: 'kain' },
    { title: 'Hampers kain 30 pcs', url: 'https://b.test/hampers', priceIdr: 300000, unit: 'paket', observedAt: '2026-10-02', region: 'Bandung', specs: 'kain' },
    { title: 'Hampers kain premium', url: 'https://c.test/hampers', priceIdr: 275000, unit: 'paket', observedAt: '2026-10-03', region: 'Surabaya', specs: 'kain' },
  ],
}

function makeDeps(overrides: {
  auth?: () => { ok: boolean; status: number; body: unknown }
  rpc?: (name: string) => { ok: boolean; status: number; body: unknown }
  provider?: () => Response
  calls?: string[]
}): MarketDeps {
  const calls = overrides.calls ?? []
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = String(input)
    if (url.endsWith('/auth/v1/user')) {
      const r = overrides.auth?.() ?? { ok: true, status: 200, body: { id: 'user-1', email: 'a@example.test' } }
      return { ok: r.ok, status: r.status, json: async () => r.body } as Response
    }
    if (url.includes('/rest/v1/rpc/')) {
      const name = url.split('/').pop() as string
      calls.push(name)
      const r = overrides.rpc?.(name) ?? { ok: true, status: 200, body: [{ allowed: true, remaining: 9, reason: null }] }
      return { ok: r.ok, status: r.status, json: async () => r.body } as Response
    }
    calls.push('provider')
    return overrides.provider?.() ?? ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(threeSources) } }] }),
    } as Response)
  }) as unknown as typeof fetch

  return { fetch: fetchImpl, config, search, env: {} as NodeJS.ProcessEnv }
}

const request = (authorization: string | null = 'Bearer user-token', body: unknown = { query: 'hampers kain' }) => ({
  authorization,
  body,
})

describe('handleMarketResearch', () => {
  it('rejects a request without a token', async () => {
    const outcome = await handleMarketResearch(request(null), makeDeps({}))
    expect(outcome.status).toBe(401)
    expect((outcome.json as { error: { code: string } }).error.code).toBe('unauthorized')
  })

  it('answers 409 when the quota function says no', async () => {
    const calls: string[] = []
    const outcome = await handleMarketResearch(request(), makeDeps({
      calls,
      rpc: () => ({ ok: true, status: 200, body: [{ allowed: false, remaining: 0, reason: 'quota' }] }),
    }))
    expect(outcome.status).toBe(409)
    expect(calls).toEqual(['begin_market_research'])
  })

  it('returns the built result when the provider finds three comparables', async () => {
    const calls: string[] = []
    const outcome = await handleMarketResearch(request(), makeDeps({ calls }))
    expect(calls).toEqual(['begin_market_research', 'provider'])
    expect(outcome.status).toBe(200)
    const body = outcome.json as { result: { status: string; observedRange: unknown } }
    expect(body.result.status).toBe('ok')
    expect(body.result.observedRange).toEqual({ minIdr: 250000, maxIdr: 300000, count: 3 })
  })

  it('refunds the quota and answers 502 when the provider fails', async () => {
    const calls: string[] = []
    const outcome = await handleMarketResearch(request(), makeDeps({
      calls,
      provider: () => ({ ok: false, status: 500, json: async () => ({}) } as Response),
    }))
    expect(outcome.status).toBe(502)
    expect(calls).toContain('refund_market_research')
  })

  it('reports an unconfigured server as disabled without spending quota', async () => {
    const calls: string[] = []
    const outcome = await handleMarketResearch(request(), { ...makeDeps({ calls }), search: null })
    expect(outcome.status).toBe(503)
    expect((outcome.json as { error: { code: string } }).error.code).toBe('disabled')
    expect(calls).not.toContain('begin_market_research')
  })

  it('never returns a recommendation', async () => {
    const outcome = await handleMarketResearch(request(), makeDeps({}))
    const body = outcome.json as { result: { recommendation: unknown } }
    expect(body.result.recommendation).toBeNull()
  })

  it('rejects an empty query before spending quota', async () => {
    const calls: string[] = []
    const outcome = await handleMarketResearch(request('Bearer t', { query: '   ' }), makeDeps({ calls }))
    expect(outcome.status).toBe(422)
    expect(calls).toEqual([])
  })
})
