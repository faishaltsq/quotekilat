import { describe, expect, it, vi } from 'vitest'
import { handleQrisWebhook, type QrisWebhookDeps } from '../../server/billing/qrisWebhook'

const service = { url: 'https://abcd.supabase.co', key: 'service-key' }

type Row = { qris_signature: string | null; status: string; total_idr: number | null; amount_idr: number }

function makeDeps(overrides: {
  order?: Row | null
  rpc?: () => { ok: boolean; status: number; data: unknown }
  calls?: string[]
} = {}): QrisWebhookDeps {
  const calls = overrides.calls ?? []
  const rpcCalls: Record<string, unknown>[] = []
  const order = overrides.order === undefined
    ? { qris_signature: 'sig-abc', status: 'pending', total_idr: 59042, amount_idr: 59000 }
    : overrides.order
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url.includes('/rest/v1/billing_orders')) {
      calls.push('read_order')
      const body = order ? [order] : []
      return { ok: true, status: 200, json: async () => body } as Response
    }
    if (url.includes('/rest/v1/rpc/')) {
      calls.push(url.split('/').pop() as string)
      rpcCalls.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>)
      const r = overrides.rpc?.() ?? { ok: true, status: 200, data: [{ applied: true, plan: 'pro', reason: null }] }
      return { ok: r.ok, status: r.status, json: async () => r.data } as Response
    }
    calls.push('unknown:' + url)
    return { ok: false, status: 404, json: async () => ({}) } as Response
  }) as unknown as typeof fetch
  return {
    fetch: fetchImpl,
    env: {} as NodeJS.ProcessEnv,
    service,
    qris: { apiKey: 'k', merchantId: 'm', isProduction: false },
    rpcCalls,
  } as QrisWebhookDeps & { rpcCalls?: Record<string, unknown>[] }
}

const paid = {
  order_id: 'QK-20261022-ABCDEFGHIJ',
  status: 'PAID',
  total_amount: 59042,
  signature: 'sig-abc',
  payment_date: '2026-10-22T08:00:00Z',
  transaction_id: 'trx-1',
}

describe('handleQrisWebhook', () => {
  it('reads paid_at, the field the live webhook actually sends', async () => {
    // Captured from KlikQRIS: the payment timestamp is paid_at and amounts are
    // decimal strings. payment_date does not exist; losing it meant every
    // settlement recorded now() instead of the real payment time.
    const calls: string[] = []
    const deps = makeDeps({
      calls,
      order: { qris_signature: 'sig-abc', status: 'pending', total_idr: 59565, amount_idr: 59000 },
    })
    const outcome = await handleQrisWebhook(
      {
        body: {
          order_id: 'QK-20261022-ABCDEFGHIJ',
          status: 'PAID',
          total_amount: '59565.00',
          signature: 'sig-abc',
          paid_at: '2026-10-22 16:30:00',
        },
      },
      deps,
    )
    expect(outcome.status).toBe(200)
    expect(calls).toEqual(['read_order', 'apply_qris_event'])
    const rpc = (deps as unknown as { rpcCalls?: Record<string, unknown>[] }).rpcCalls?.[0]
    // paid_at is WIB wall-clock, so 16:30:00 local is 09:30Z.
    expect(rpc?.p_paid_at).toBe('2026-10-22T09:30:00.000Z')
  })

  it('answers 503 when the gateway is not configured', async () => {
    const outcome = await handleQrisWebhook({ body: paid }, { ...makeDeps(), qris: null })
    expect(outcome.status).toBe(503)
  })

  it('rejects a body without a signature', async () => {
    const outcome = await handleQrisWebhook({ body: { ...paid, signature: undefined } }, makeDeps())
    expect(outcome.status).toBe(401)
    expect((outcome.json as { error: { code: string } }).error.code).toBe('bad_signature')
  })

  it('rejects a signature that does not match the stored one', async () => {
    const outcome = await handleQrisWebhook({ body: { ...paid, signature: 'forged' } }, makeDeps())
    expect(outcome.status).toBe(401)
  })

  it('rejects an order that never stored a signature', async () => {
    // A legacy row with no signature would otherwise be claimable by anyone who
    // guesses the order id.
    const outcome = await handleQrisWebhook(
      { body: paid },
      makeDeps({ order: { qris_signature: null, status: 'pending', total_idr: 59042, amount_idr: 59000 } }),
    )
    expect(outcome.status).toBe(401)
  })

  it('rejects an unknown order', async () => {
    const outcome = await handleQrisWebhook({ body: paid }, makeDeps({ order: null }))
    expect(outcome.status).toBe(404)
  })

  it('rejects an underpayment before touching the database function', async () => {
    const calls: string[] = []
    const outcome = await handleQrisWebhook(
      { body: { ...paid, total_amount: 59000 } },
      makeDeps({ calls }),
    )
    expect(outcome.status).toBe(400)
    expect(calls).not.toContain('apply_qris_event')
  })

  it('grants on a matching signature and amount', async () => {
    const calls: string[] = []
    const outcome = await handleQrisWebhook({ body: paid }, makeDeps({ calls }))
    expect(outcome.status).toBe(200)
    expect(calls).toEqual(['read_order', 'apply_qris_event'])
    expect((outcome.json as { applied: boolean }).applied).toBe(true)
  })

  it('accepts the nested payload shape the gateway also sends', async () => {
    const nested = {
      data: {
        order_id: 'QK-20261022-ABCDEFGHIJ',
        status: 'PAID',
        total_amount: 59042,
        signature: 'sig-abc',
        transaction_id: 'trx-2',
      },
    }
    const outcome = await handleQrisWebhook({ body: nested }, makeDeps())
    expect(outcome.status).toBe(200)
  })

  it('answers 200 on a duplicate so the gateway stops retrying', async () => {
    const outcome = await handleQrisWebhook(
      { body: paid },
      makeDeps({ rpc: () => ({ ok: true, status: 200, data: [{ applied: false, plan: 'pro', reason: 'duplicate' }] }) }),
    )
    expect(outcome.status).toBe(200)
    expect((outcome.json as { applied: boolean }).applied).toBe(false)
  })

  it('answers 502 when the database is unreachable so the gateway retries', async () => {
    const outcome = await handleQrisWebhook(
      { body: paid },
      makeDeps({ rpc: () => ({ ok: false, status: 500, data: null }) }),
    )
    expect(outcome.status).toBe(502)
  })

  it('rejects an oversized body', async () => {
    const outcome = await handleQrisWebhook({ body: paid, bytes: 99999 }, makeDeps())
    expect(outcome.status).toBe(413)
  })
})
