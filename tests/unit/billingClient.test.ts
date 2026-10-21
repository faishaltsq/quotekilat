import { describe, expect, it, vi } from 'vitest'
import { fetchBillingStatus, startCheckout } from '../../src/lib/billing/client'

const okStatus = {
  plan: 'pro',
  currentPeriodEnd: '2026-11-21T00:00:00.000Z',
  limits: { aiParse: 40, quotes: 100, marketResearch: 10 },
  remaining: { aiParse: 39, quotes: 100 },
}

const jsonResponse = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body }) as Response

describe('fetchBillingStatus', () => {
  it('returns the plan and limits', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(okStatus)) as unknown as typeof fetch
    const result = await fetchBillingStatus({ token: 't', fetchImpl })
    expect(result).toEqual({ ok: true, status: okStatus })
  })

  it('reports unauthorized without inventing a plan', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: { code: 'unauthorized', message: 'x' } }, 401)) as unknown as typeof fetch
    const result = await fetchBillingStatus({ token: 't', fetchImpl })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('unauthorized')
  })

  it('reports offline instead of throwing', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('offline') }) as unknown as typeof fetch
    const result = await fetchBillingStatus({ token: 't', fetchImpl })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('offline')
  })
})

describe('startCheckout', () => {
  it('sends only the plan name', async () => {
    let body: unknown = null
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      body = JSON.parse(String(init.body))
      return jsonResponse({ orderId: 'QK-1', redirectUrl: 'https://app.sandbox.midtrans.com/x' })
    }) as unknown as typeof fetch

    const result = await startCheckout({ token: 't', plan: 'pro', fetchImpl })
    expect(body).toEqual({ plan: 'pro' })
    expect(result).toEqual({ ok: true, orderId: 'QK-1', redirectUrl: 'https://app.sandbox.midtrans.com/x' })
  })

  it('refuses a redirect that is not an http(s) url', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ orderId: 'QK-1', redirectUrl: 'javascript:alert(1)' })) as unknown as typeof fetch
    const result = await startCheckout({ token: 't', plan: 'pro', fetchImpl })
    expect(result.ok).toBe(false)
  })
})
