import { describe, expect, it, vi } from 'vitest'
import { handleCheckout, type CheckoutDeps } from '../../server/billing/checkout'

const config = { url: 'https://abcd.supabase.co', key: 'sb_publishable_test' }
const midtrans = { serverKey: 'SB-Mid-server-TESTKEY', clientKey: 'SB-Mid-client-TESTKEY', isProduction: false }

function makeDeps(overrides: {
  auth?: () => { ok: boolean; status: number; body: unknown }
  rpc?: (name: string) => { ok: boolean; status: number; body: unknown }
  snap?: () => Response
  calls?: string[]
}): CheckoutDeps {
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
      const r = overrides.rpc?.(name) ?? {
        ok: true, status: 200,
        body: [{ order_id: 'QK-20260101-ABCDEFGHIJ', plan: 'pro', amount_idr: 59000 }],
      }
      return { ok: r.ok, status: r.status, json: async () => r.body } as Response
    }
    calls.push('snap')
    return overrides.snap?.() ?? ({
      ok: true, status: 201,
      json: async () => ({ token: 'snap-token', redirect_url: 'https://app.sandbox.midtrans.com/snap/v4/redirection/snap-token' }),
    } as Response)
  }) as unknown as typeof fetch

  return { fetch: fetchImpl, config, midtrans, env: {} as NodeJS.ProcessEnv }
}

const request = (authorization: string | null = 'Bearer user-token') => ({
  authorization,
  body: { plan: 'pro' },
})

describe('handleCheckout', () => {
  it('rejects a request without a token', async () => {
    const outcome = await handleCheckout(request(null), makeDeps({}))
    expect(outcome.status).toBe(401)
    expect((outcome.json as { error: { code: string } }).error.code).toBe('unauthorized')
  })

  it('rejects an unknown plan without calling Midtrans', async () => {
    const calls: string[] = []
    const outcome = await handleCheckout({ authorization: 'Bearer t', body: { plan: 'enterprise' } }, makeDeps({ calls }))
    expect(outcome.status).toBe(422)
    expect(calls).not.toContain('snap')
  })

  it('creates the order server-side and returns the redirect url', async () => {
    const calls: string[] = []
    const outcome = await handleCheckout(request(), makeDeps({ calls }))
    expect(calls).toEqual(['create_billing_order', 'snap', 'attach_billing_session'])
    expect(outcome.status).toBe(200)
    expect(outcome.json).toEqual({ orderId: 'QK-20260101-ABCDEFGHIJ', redirectUrl: 'https://app.sandbox.midtrans.com/snap/v4/redirection/snap-token' })
  })

  it('never accepts an amount from the client', async () => {
    const calls: string[] = []
    const deps = makeDeps({ calls })
    await handleCheckout({ authorization: 'Bearer t', body: { plan: 'pro', amount: 1 } }, deps)
    const snapCall = (deps.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls
      .find(([url]) => String(url).includes('/snap/v1/transactions'))
    expect(JSON.parse(String(snapCall?.[1].body))).toMatchObject({
      transaction_details: { gross_amount: 59000 },
    })
  })

  it('reports a quota-free but misconfigured server as disabled', async () => {
    const outcome = await handleCheckout(request(), { ...makeDeps({}), midtrans: null })
    expect(outcome.status).toBe(503)
    expect((outcome.json as { error: { code: string } }).error.code).toBe('disabled')
  })

  it('surfaces a Midtrans failure as 502 and does not claim success', async () => {
    const outcome = await handleCheckout(request(), makeDeps({
      snap: () => ({ ok: false, status: 400, json: async () => ({ error_messages: ['bad'] }) } as Response),
    }))
    expect(outcome.status).toBe(502)
    expect((outcome.json as { error: { code: string } }).error.code).toBe('upstream')
  })
})
