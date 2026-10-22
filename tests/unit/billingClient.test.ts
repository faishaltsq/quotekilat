import { describe, expect, it, vi } from 'vitest'
import { fetchBillingStatus, startCheckout } from '../../src/lib/billing/client'

const okStatus = {
  plan: 'pro',
  currentPeriodEnd: '2026-11-21T00:00:00.000Z',
  limits: { aiParse: 40, quotes: 100, marketResearch: 10 },
  remaining: { aiParse: 39, quotes: 100 },
}

const okQris = {
  orderId: 'QK-20261022-ABCDEFGHIJ',
  qris: {
    imageUrl: 'https://klikqris.test/qr/1.png',
    payload: '00020101021226...',
    amountIdr: 59000,
    uniqueCode: 42,
    totalIdr: 59042,
    expiredAt: '2026-10-22T08:30:00Z',
  },
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
      return jsonResponse(okQris)
    }) as unknown as typeof fetch

    const result = await startCheckout({ token: 't', plan: 'pro', fetchImpl })
    expect(body).toEqual({ plan: 'pro' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.orderId).toBe('QK-20261022-ABCDEFGHIJ')
      expect(result.qris.totalIdr).toBe(59042)
      expect(result.qris.uniqueCode).toBe(42)
    }
  })

  it('never returns a redirect target: QRIS is scanned in place', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(okQris)) as unknown as typeof fetch
    const result = await startCheckout({ token: 't', plan: 'pro', fetchImpl })
    expect(JSON.stringify(result)).not.toContain('redirectUrl')
  })

  it('refuses a session with no scannable code', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ orderId: 'QK-1', qris: { imageUrl: '', payload: '', totalIdr: 59042 } })) as unknown as typeof fetch
    const result = await startCheckout({ token: 't', plan: 'pro', fetchImpl })
    expect(result.ok).toBe(false)
  })

  it('refuses a session with no positive total', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ orderId: 'QK-1', qris: { imageUrl: 'https://x/y.png', payload: 'p', totalIdr: 0 } })) as unknown as typeof fetch
    const result = await startCheckout({ token: 't', plan: 'pro', fetchImpl })
    expect(result.ok).toBe(false)
  })

  it('reports a disabled gateway as disabled', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: { code: 'disabled' } }, 503)) as unknown as typeof fetch
    const result = await startCheckout({ token: 't', plan: 'pro', fetchImpl })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('disabled')
  })
})
