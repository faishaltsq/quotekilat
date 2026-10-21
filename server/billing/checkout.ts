import { createSnapTransaction, readMidtransEnv, type MidtransEnv } from '../_lib/midtrans'
import { callRpc, readCaller, readServerConfig, type ServerConfig } from '../_lib/supabase'

export type CheckoutDeps = {
  fetch: typeof fetch
  env: NodeJS.ProcessEnv
  config: ServerConfig | null
  midtrans: MidtransEnv | null
}

export type HandlerResponse = { status: number; json: Record<string, unknown> }

const error = (status: number, code: string, message: string): HandlerResponse => ({
  status,
  json: { error: { code, message } },
})

type OrderRow = { order_id: string; plan: string; amount_idr: number }

/** Only plans listed here can be bought. The amount always comes from plan_prices. */
const SELLABLE = new Set(['pro'])

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
  if (!deps.midtrans) return error(503, 'disabled', 'Billing belum aktif di server ini.')

  const caller = await readCaller(token, deps.config, deps.fetch)
  if (!caller) return error(401, 'unauthorized', 'Sesi berakhir. Masuk lagi.')

  const created = await callRpc('create_billing_order', { p_plan: plan }, token, deps.config, deps.fetch)
  const order = Array.isArray(created.data) ? (created.data[0] as OrderRow | undefined) : (created.data as OrderRow | null)
  if (!created.ok || !order?.order_id) {
    return error(502, 'upstream', 'Gagal membuat pesanan. Coba lagi.')
  }

  const snap = await createSnapTransaction(
    { orderId: order.order_id, amountIdr: Number(order.amount_idr), plan, customerEmail: caller.email },
    deps.midtrans,
    deps.fetch,
  )
  if (!snap.ok) return error(502, 'upstream', 'Penyedia pembayaran sedang tidak tersedia.')

  // Store the session so the webhook can be matched back even if the browser
  // never returns. A failure here is not fatal: the order still exists.
  await callRpc(
    'attach_billing_session',
    { p_order_id: order.order_id, p_snap_token: snap.token, p_redirect_url: snap.redirectUrl },
    token,
    deps.config,
    deps.fetch,
  )

  return { status: 200, json: { orderId: order.order_id, redirectUrl: snap.redirectUrl } }
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
      midtrans: readMidtransEnv(),
    },
  )
  return Response.json(outcome.json, { status: outcome.status })
}
