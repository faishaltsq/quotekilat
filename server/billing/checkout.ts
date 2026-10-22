import { createQrisTransaction, readQrisEnv, type QrisEnv } from '../_lib/qris'
import { callRpc, callRpcAsService, readCaller, readServerConfig, readServiceConfig, type ServerConfig } from '../_lib/supabase'

export type CheckoutDeps = {
  fetch: typeof fetch
  env: NodeJS.ProcessEnv
  config: ServerConfig | null
  /** Service config: the only role allowed to attach a QRIS session. */
  service: ServerConfig | null
  qris: QrisEnv | null
}

export type HandlerResponse = { status: number; json: Record<string, unknown> }

const error = (status: number, code: string, message: string): HandlerResponse => ({
  status,
  json: { error: { code, message } },
})

type OrderRow = { order_id: string; plan: string; amount_idr: number }

/** Only plans listed here can be bought. The amount always comes from plan_prices. */
const SELLABLE = new Set(['pro'])

/**
 * Creates one QRIS transaction for a plan. There is no redirect: the buyer scans
 * the code on the page, and the plan is only granted when the webhook arrives
 * with the signature this call stored.
 */
export async function handleCheckout(
  input: { authorization: string | null; body: unknown },
  deps: CheckoutDeps,
): Promise<HandlerResponse> {
  const payload = input.body as { plan?: unknown } | null
  const plan = typeof payload?.plan === 'string' ? payload.plan : ''
  if (!SELLABLE.has(plan)) return error(422, 'invalid', 'Paket tidak dikenal.')

  const token = (input.authorization ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return error(401, 'unauthorized', 'Masuk dulu untuk berlangganan.')
  if (!deps.config) return error(503, 'disabled', 'Billing belum aktif di server ini.')
  if (!deps.qris) return error(503, 'disabled', 'Billing belum aktif di server ini.')

  const caller = await readCaller(token, deps.config, deps.fetch)
  if (!caller) return error(401, 'unauthorized', 'Sesi berakhir. Masuk lagi.')

  const created = await callRpc('create_billing_order', { p_plan: plan }, token, deps.config, deps.fetch)
  const order = Array.isArray(created.data) ? (created.data[0] as OrderRow | undefined) : (created.data as OrderRow | null)
  if (!created.ok || !order?.order_id) {
    return error(502, 'upstream', 'Gagal membuat pesanan. Coba lagi.')
  }

  const outcome = await createQrisTransaction(
    {
      orderId: order.order_id,
      amountIdr: Number(order.amount_idr),
      description: `QuoteKilat ${plan === 'pro' ? 'Pro' : plan}`,
    },
    deps.qris,
    deps.fetch,
  )

  if (!outcome.ok) {
    if (outcome.kind === 'amount') return error(422, 'invalid', outcome.detail ?? 'Nominal tidak valid.')
    return error(502, 'upstream', 'Penyedia pembayaran sedang tidak tersedia.')
  }

  // Store the signature and the exact total so a later settlement can verify
  // the gateway's answer. This uses the service key, not the buyer's token: the
  // buyer is no longer allowed to write these fields, because writing them is
  // what authorises a payment.
  if (!deps.service) return error(503, 'disabled', 'Billing belum aktif di server ini.')

  const attached = await callRpcAsService(
    'attach_qris_session',
    {
      p_order_id: order.order_id,
      p_signature: outcome.session.signature,
      p_payload: outcome.session.payload,
      p_image_url: outcome.session.imageUrl,
      p_total_idr: outcome.session.totalIdr,
      p_expired_at: outcome.session.expiredAt,
    },
    deps.service,
    deps.fetch,
  )

  // Without a stored signature the buyer would pay into an order that can never
  // be settled, so this is a hard failure rather than a warning.
  if (!attached.ok) {
    return error(502, 'upstream', 'Gagal menyiapkan pembayaran. Coba lagi.')
  }

  return {
    status: 200,
    json: {
      orderId: order.order_id,
      plan,
      qris: {
        imageUrl: outcome.session.imageUrl,
        payload: outcome.session.payload,
        amountIdr: outcome.session.amountIdr,
        uniqueCode: outcome.session.uniqueCode,
        totalIdr: outcome.session.totalIdr,
        expiredAt: outcome.session.expiredAt,
      },
    },
  }
}

const MAX_BODY_BYTES = 8192

/** Thin Web-API wrapper. */
export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return Response.json({ error: { code: 'method', message: 'POST only.' } }, { status: 405 })
  }

  const raw = await request.text()
  if (raw.length > MAX_BODY_BYTES) {
    return Response.json({ error: { code: 'too_long', message: 'Body terlalu besar.' } }, { status: 413 })
  }

  let body: unknown
  try { body = JSON.parse(raw) } catch { body = null }

  const outcome = await handleCheckout(
    { authorization: request.headers.get('authorization'), body },
    {
      fetch,
      env: process.env,
      config: readServerConfig(),
      service: readServiceConfig(),
      qris: readQrisEnv(),
    },
  )
  return Response.json(outcome.json, { status: outcome.status })
}
