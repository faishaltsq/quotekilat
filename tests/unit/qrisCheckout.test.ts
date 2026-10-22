import { describe, expect, it, vi } from 'vitest'
import { handleCheckout, type CheckoutDeps } from '../../server/billing/checkout'

const config = { url: 'https://abcd.supabase.co', key: 'sb_publishable_test' }
const qris = { apiKey: 'kq-key', merchantId: 'kq-merchant', isProduction: false }

const qrisBody = {
  status: true,
  data: {
    order_id: 'QK-20261022-ABCDEFGHIJ',
    amount: 59000,
    total_amount: 59042,
    status: 'PENDING',
    qris_url: 'https://klikqris.test/qr/1.png',
    qris_image: 'data:image/png;base64,AAA',
    expired_at: '2026-10-22T08:30:00Z',
    signature: 'sig-abc',
  },
}

function makeDeps(overrides: {
  auth?: () => { ok: boolean; status: number; body: unknown }
  rpc?: (name: string) => { ok: boolean; status: number; body: unknown }
  qris?: () => Response
  calls?: string[]
  qrisEnv?: typeof qris | null
} = {}): CheckoutDeps {
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
        ok: true,
        status: 200,
        body: [{ order_id: 'QK-20261022-ABCDEFGHIJ', plan: 'pro', amount_idr: 59000 }],
      }
      return { ok: r.ok, status: r.status, json: async () => r.body } as Response
    }
    if (url.includes('klikqris')) {
      calls.push('qris')
      return overrides.qris?.() ?? ({ ok: true, status: 200, json: async () => qrisBody } as Response)
    }
    calls.push('unknown:' + url)
    return { ok: false, status: 404, json: async () => ({}) } as Response
  }) as unknown as typeof fetch

  return {
    fetch: fetchImpl,
    env: {} as NodeJS.ProcessEnv,
    config,
    service: { url: 'https://abcd.supabase.co', key: 'service-key' },
    qris: overrides.qrisEnv === undefined ? qris : overrides.qrisEnv,
  }
}

const request = (authorization: string | null = 'Bearer user-token', body: unknown = { plan: 'pro' }) => ({
  authorization,
  body,
})

describe('handleCheckout with KlikQRIS', () => {
  it('rejects an unknown plan before any call', async () => {
    const calls: string[] = []
    const outcome = await handleCheckout(request('Bearer t', { plan: 'enterprise' }), makeDeps({ calls }))
    expect(outcome.status).toBe(422)
    expect(calls).toEqual([])
  })

  it('rejects a request without a token', async () => {
    const outcome = await handleCheckout(request(null), makeDeps())
    expect(outcome.status).toBe(401)
  })

  it('answers 503 when the gateway is not configured', async () => {
    const outcome = await handleCheckout(request(), makeDeps({ qrisEnv: null }))
    expect(outcome.status).toBe(503)
    expect((outcome.json as { error: { code: string } }).error.code).toBe('disabled')
  })

  it('creates the order, asks the gateway, and stores the session', async () => {
    const calls: string[] = []
    const outcome = await handleCheckout(request(), makeDeps({ calls }))
    expect(calls).toEqual(['create_billing_order', 'qris', 'attach_qris_session'])
    expect(outcome.status).toBe(200)
  })

  it('returns the QR image and the exact total to pay', async () => {
    const outcome = await handleCheckout(request(), makeDeps())
    const json = outcome.json as { orderId: string; qris: { imageUrl: string; totalIdr: number; uniqueCode: number } }
    expect(json.orderId).toBe('QK-20261022-ABCDEFGHIJ')
    expect(json.qris.imageUrl).toBe('https://klikqris.test/qr/1.png')
    expect(json.qris.totalIdr).toBe(59042)
    expect(json.qris.uniqueCode).toBe(42)
  })

  it('never returns a redirect url: QRIS is scanned in place', async () => {
    const outcome = await handleCheckout(request(), makeDeps())
    expect(JSON.stringify(outcome.json)).not.toContain('redirectUrl')
  })

  it('answers 502 when the gateway fails, leaving the order pending', async () => {
    const calls: string[] = []
    const outcome = await handleCheckout(
      request(),
      makeDeps({
        calls,
        qris: () => ({ ok: false, status: 500, json: async () => ({ status: false, message: 'down' }) } as Response),
      }),
    )
    expect(outcome.status).toBe(502)
    expect(calls).not.toContain('attach_qris_session')
  })

  it('answers 502 when the order cannot be created', async () => {
    const outcome = await handleCheckout(
      request(),
      makeDeps({ rpc: () => ({ ok: false, status: 500, body: null }) }),
    )
    expect(outcome.status).toBe(502)
  })

  it('answers 401 when the session is invalid', async () => {
    const outcome = await handleCheckout(
      request(),
      makeDeps({ auth: () => ({ ok: false, status: 401, body: {} }) }),
    )
    expect(outcome.status).toBe(401)
  })
})
