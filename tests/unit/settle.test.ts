import { describe, expect, it, vi } from 'vitest'
import { handleSettle } from '../../server/billing/settle'

const service = { url: 'https://abcd.supabase.co', key: 'service-key' }
const config = { url: 'https://abcd.supabase.co', key: 'publishable' }
const qris = { apiKey: 'k', merchantId: 'm', isProduction: true }

const ORDER = 'QK-20261022-ABCDEFGHIJ'
const SIG = 'ygzOPsMVszrJY6AR5nFCX3gLsRkMfP1792660756'

type Row = { order_id: string; owner_id: string; status: string; total_idr: number; qris_signature: string | null }

function makeDeps(overrides: {
  order?: Row | null
  gateway?: Record<string, unknown> | null
  gatewayOk?: boolean
  callerId?: string
  rpc?: { applied: boolean; reason?: string | null }
} = {}) {
  const order = overrides.order === undefined
    ? { order_id: ORDER, owner_id: 'user-1', status: 'pending', total_idr: 59565, qris_signature: SIG }
    : overrides.order
  const gateway = overrides.gateway === undefined
    ? { status: true, data: { order_id: ORDER, status: 'PAID', total_amount: '59565.00', signature: SIG, paid_at: '2026-10-22 16:30:00' } }
    : overrides.gateway
  const rpcCalls: Record<string, unknown>[] = []

  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url.includes('/auth/v1/user')) {
      return { ok: true, status: 200, json: async () => ({ id: overrides.callerId ?? 'user-1' }) } as Response
    }
    if (url.includes('/rest/v1/billing_orders')) {
      return { ok: true, status: 200, json: async () => (order ? [order] : []) } as Response
    }
    if (url.includes('/rest/v1/rpc/')) {
      rpcCalls.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>)
      const r = overrides.rpc ?? { applied: true, reason: null }
      return { ok: true, status: 200, json: async () => [r] } as Response
    }
    if (url.includes('/qris/status/')) {
      if (overrides.gatewayOk === false) return { ok: false, status: 502, json: async () => ({}) } as Response
      return { ok: true, status: 200, json: async () => gateway } as Response
    }
    return { ok: false, status: 404, json: async () => ({}) } as Response
  }) as unknown as typeof fetch

  return {
    deps: { fetch: fetchImpl, env: {} as NodeJS.ProcessEnv, config, service, qris },
    rpcCalls,
  }
}

const input = { authorization: 'Bearer tok', body: { orderId: ORDER } }

describe('handleSettle', () => {
  it('settles only when the gateway itself reports PAID at the stored total', async () => {
    const { deps, rpcCalls } = makeDeps()
    const out = await handleSettle(input, deps)
    expect(out.status).toBe(200)
    expect(rpcCalls[0].p_status).toBe('PAID')
    expect(rpcCalls[0].p_total_amount).toBe(59565)
    // paid_at is WIB wall-clock: 16:30 local is 09:30Z.
    expect(rpcCalls[0].p_paid_at).toBe('2026-10-22T09:30:00.000Z')
  })

  it('never lets the caller supply the status or the amount', async () => {
    // A body that tries to assert its own payment must be ignored entirely.
    const { deps, rpcCalls } = makeDeps({
      gateway: { status: true, data: { order_id: ORDER, status: 'PENDING', total_amount: '59565.00', signature: SIG } },
    })
    const out = await handleSettle(
      { authorization: 'Bearer tok', body: { orderId: ORDER, status: 'PAID', total_amount: 59565 } },
      deps,
    )
    expect(out.status).toBe(200)
    // The gateway said PENDING, so nothing was granted even though the body lied.
    expect(rpcCalls).toHaveLength(0)
    expect((out.json as { plan: string }).plan).toBe('free')
  })

  it('refuses an order that belongs to someone else', async () => {
    const { deps, rpcCalls } = makeDeps({ callerId: 'attacker' })
    const out = await handleSettle(input, deps)
    expect(out.status).toBe(404)
    expect(rpcCalls).toHaveLength(0)
  })

  it('refuses when the gateway signature does not match the stored one', async () => {
    const { deps, rpcCalls } = makeDeps({
      gateway: { status: true, data: { order_id: ORDER, status: 'PAID', total_amount: '59565.00', signature: 'other' } },
    })
    const out = await handleSettle(input, deps)
    expect(out.status).toBe(409)
    expect(rpcCalls).toHaveLength(0)
  })

  it('refuses when the gateway reports a different total than the order', async () => {
    const { deps, rpcCalls } = makeDeps({
      gateway: { status: true, data: { order_id: ORDER, status: 'PAID', total_amount: '1.00', signature: SIG } },
    })
    const out = await handleSettle(input, deps)
    expect(out.status).toBe(409)
    expect(rpcCalls).toHaveLength(0)
  })

  it('refuses an order that never attached a session', async () => {
    const { deps, rpcCalls } = makeDeps({
      order: { order_id: ORDER, owner_id: 'user-1', status: 'pending', total_idr: 0, qris_signature: null },
    })
    const out = await handleSettle(input, deps)
    expect(out.status).toBe(409)
    expect(rpcCalls).toHaveLength(0)
  })

  it('answers 503 when billing is not configured', async () => {
    const { deps } = makeDeps()
    const out = await handleSettle(input, { ...deps, qris: null })
    expect(out.status).toBe(503)
  })

  it('answers 401 without a session', async () => {
    const { deps } = makeDeps()
    const out = await handleSettle({ authorization: null, body: { orderId: ORDER } }, deps)
    expect(out.status).toBe(401)
  })

  it('reports the gateway being down as upstream rather than granting', async () => {
    const { deps, rpcCalls } = makeDeps({ gatewayOk: false })
    const out = await handleSettle(input, deps)
    expect(out.status).toBe(502)
    expect(rpcCalls).toHaveLength(0)
  })
})
