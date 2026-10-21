import { describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { handleWebhook, type WebhookDeps } from '../../server/billing/webhook'

const midtrans = { serverKey: 'SB-Mid-server-TESTKEY', clientKey: 'SB-Mid-client-TESTKEY', isProduction: false }
const service = { url: 'https://abcd.supabase.co', key: 'sb_secret_test' }

const sign = (orderId: string, statusCode: string, grossAmount: string) =>
  createHash('sha512').update(`${orderId}${statusCode}${grossAmount}${midtrans.serverKey}`).digest('hex')

const notification = (overrides: Record<string, unknown> = {}) => {
  const orderId = 'QK-20260101-ABCDEFGHIJ'
  const statusCode = '200'
  const grossAmount = '59000.00'
  return {
    order_id: orderId,
    status_code: statusCode,
    gross_amount: grossAmount,
    signature_key: sign(orderId, statusCode, grossAmount),
    transaction_status: 'settlement',
    fraud_status: '',
    transaction_id: 'txn-1',
    payment_type: 'qris',
    ...overrides,
  }
}

function makeDeps(overrides: {
  rpc?: (name: string, args: Record<string, unknown>) => { ok: boolean; status: number; body: unknown }
  service?: typeof service | null
  midtrans?: typeof midtrans | null
}): WebhookDeps {
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const name = String(input).split('/').pop() as string
    const args = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}
    const r = overrides.rpc?.(name, args) ?? { ok: true, status: 200, body: [{ applied: true, plan: 'pro', reason: null }] }
    return { ok: r.ok, status: r.status, json: async () => r.body } as Response
  }) as unknown as typeof fetch

  return {
    fetch: fetchImpl,
    env: {} as NodeJS.ProcessEnv,
    service: overrides.service === undefined ? service : overrides.service,
    midtrans: overrides.midtrans === undefined ? midtrans : overrides.midtrans,
  }
}

describe('handleWebhook', () => {
  it('accepts a correctly signed settlement and calls the RPC once', async () => {
    const calls: string[] = []
    const outcome = await handleWebhook({ body: notification() }, makeDeps({
      rpc: (name) => { calls.push(name); return { ok: true, status: 200, body: [{ applied: true, reason: null }] } },
    }))
    expect(outcome.status).toBe(200)
    expect(calls).toEqual(['apply_billing_event'])
  })

  it('rejects a forged signature with 401 and never touches the database', async () => {
    const calls: string[] = []
    const outcome = await handleWebhook(
      { body: notification({ signature_key: 'a'.repeat(128) }) },
      makeDeps({ rpc: (name) => { calls.push(name); return { ok: true, status: 200, body: [] } } }),
    )
    expect(outcome.status).toBe(401)
    expect(calls).toEqual([])
  })

  it('rejects a tampered amount even with a signature for the original', async () => {
    const outcome = await handleWebhook(
      { body: notification({ gross_amount: '1000.00' }) },
      makeDeps({}),
    )
    expect(outcome.status).toBe(401)
  })

  it('answers 200 for a duplicate so the provider stops retrying', async () => {
    const outcome = await handleWebhook({ body: notification() }, makeDeps({
      rpc: () => ({ ok: true, status: 200, body: [{ applied: false, reason: 'duplicate' }] }),
    }))
    expect(outcome.status).toBe(200)
    expect(outcome.json).toEqual({ applied: false, reason: 'duplicate' })
  })

  it('answers 502 when the database write fails, so the provider retries', async () => {
    const outcome = await handleWebhook({ body: notification() }, makeDeps({
      rpc: () => ({ ok: false, status: 500, body: null }),
    }))
    expect(outcome.status).toBe(502)
  })

  it('answers 503 when credentials are absent', async () => {
    const outcome = await handleWebhook({ body: notification() }, makeDeps({ service: null }))
    expect(outcome.status).toBe(503)
  })

  it('rejects a body that is missing required fields', async () => {
    const outcome = await handleWebhook({ body: { order_id: 'QK-1' } }, makeDeps({}))
    expect(outcome.status).toBe(422)
  })

  it('rejects an oversized body before parsing', async () => {
    const outcome = await handleWebhook({ body: notification(), bytes: 9000 }, makeDeps({}))
    expect(outcome.status).toBe(413)
  })
})
