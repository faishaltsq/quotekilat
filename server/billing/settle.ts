import { parseGatewayTimestamp, readQrisEnv, type QrisEnv } from '../_lib/qris'
import { callRpcAsService, readCaller, readServerConfig, readServiceConfig, type ServerConfig } from '../_lib/supabase'
import { timeoutSignal } from '../_lib/net'

export type SettleDeps = {
  fetch: typeof fetch
  env: NodeJS.ProcessEnv
  /** Publishable config, used only to verify the caller's own token. */
  config: ServerConfig | null
  /** Service config, used to read the order and to settle it. */
  service: ServerConfig | null
  qris: QrisEnv | null
}

export type HandlerResponse = { status: number; json: Record<string, unknown> }

const error = (status: number, code: string, message: string): HandlerResponse => ({
  status,
  json: { error: { code, message } },
})

type OrderRow = {
  order_id: string
  owner_id: string
  status: string
  total_idr: number | null
  qris_signature: string | null
}

/** Statuses the gateway only reaches once the money has actually moved. */
const SETTLED = new Set(['PAID', 'SUCCESS', 'SETTLEMENT', 'EXPIRED', 'FAILED', 'CANCELLED', 'CANCEL'])

/**
 * Settles a payment by asking the gateway, because KlikQRIS exposes no webhook
 * field in its dashboard: nothing would ever call the webhook route, so a buyer
 * who scanned the code would never be upgraded.
 *
 * The caller supplies only the order id. The status and the amount come from
 * the gateway's own answer, and are then checked against what this server
 * stored when it created the transaction — so a browser that claims "I paid"
 * changes nothing by itself. That is also why the order is read with the
 * service key: qris_signature is not readable by its owner.
 */
export async function handleSettle(
  input: { authorization: string | null; body: unknown },
  deps: SettleDeps,
): Promise<HandlerResponse> {
  const orderId = (input.body as { orderId?: unknown } | null)?.orderId
  if (typeof orderId !== 'string' || !orderId.trim()) return error(422, 'invalid', 'Pesanan tidak dikenal.')

  const token = (input.authorization ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return error(401, 'unauthorized', 'Masuk dulu untuk memeriksa pembayaran.')
  if (!deps.config || !deps.service || !deps.qris) return error(503, 'disabled', 'Billing belum aktif di server ini.')

  const caller = await readCaller(token, deps.config, deps.fetch)
  if (!caller) return error(401, 'unauthorized', 'Sesi berakhir. Masuk lagi.')

  const lookup = await deps.fetch(
    `${deps.service.url}/rest/v1/billing_orders?order_id=eq.${encodeURIComponent(orderId)}&select=order_id,owner_id,status,total_idr,qris_signature&limit=1`,
    { headers: { apikey: deps.service.key, authorization: `Bearer ${deps.service.key}` } },
  ).catch(() => null)

  if (!lookup?.ok) return error(502, 'upstream', 'Server pembayaran sedang sibuk.')
  const rows = (await lookup.json().catch(() => null)) as OrderRow[] | null
  const order = Array.isArray(rows) ? rows[0] : undefined
  // Someone else's order is reported as missing, not as forbidden: the caller
  // has no business learning that an order id exists.
  if (!order || order.owner_id !== caller.id) return error(404, 'unknown_order', 'Pesanan tidak ditemukan.')

  if (order.status === 'paid') {
    return { status: 200, json: { plan: 'pro', applied: false, reason: 'already_paid' } }
  }

  const expected = order.total_idr ?? 0
  if (!order.qris_signature || expected <= 0) {
    return error(409, 'no_session', 'Pesanan ini belum punya kode QRIS. Buat ulang.')
  }

  const gateway = await fetchGatewayStatus(orderId, deps).catch(() => null)
  if (!gateway) return error(502, 'upstream', 'Penyedia pembayaran tidak menjawab.')

  const reported = gateway.status
  const reportedTotal = Math.round(Number(gateway.total_amount ?? 0))
  // A signature mismatch means the gateway is talking about a different
  // transaction than the one this order stored.
  if (!gateway.signature || gateway.signature !== order.qris_signature) {
    return error(409, 'mismatch', 'Data pembayaran tidak cocok dengan pesanan.')
  }
  if (reportedTotal !== expected) {
    return error(409, 'mismatch', 'Nominal pembayaran tidak cocok dengan pesanan.')
  }

  // A pending transaction settles nothing: there is no event to record yet, and
  // forwarding it would only churn billing_events. The browser polls again.
  if (!SETTLED.has(reported)) {
    return {
      status: 200,
      json: { applied: false, plan: order.status === 'paid' ? 'pro' : 'free', status: reported, reason: 'awaiting_payment' },
    }
  }

  const result = await callRpcAsService(
    'apply_qris_event',
    {
      p_order_id: orderId,
      p_status: reported,
      p_total_amount: reportedTotal,
      p_paid_at: parseGatewayTimestamp(gateway.paid_at),
      p_gateway_ref: orderId,
    },
    deps.service,
    deps.fetch,
  )

  const row = Array.isArray(result.data) ? (result.data[0] as { applied?: boolean; plan?: string | null; reason?: string | null } | undefined) : null
  if (!result.ok || !row) return error(502, 'upstream', 'Gagal mencatat pembayaran. Coba lagi.')

  return {
    status: 200,
    json: {
      applied: row.applied === true,
      plan: row.plan ?? 'free',
      status: reported,
      reason: row.reason ?? null,
    },
  }
}

type GatewayStatus = { status: string; total_amount: unknown; signature: string; paid_at: unknown }

async function fetchGatewayStatus(orderId: string, deps: SettleDeps): Promise<GatewayStatus | null> {
  const qris = deps.qris as QrisEnv
  const base = qris.isProduction ? 'https://klikqris.com/api' : 'https://klikqris.com/api/sandbox'
  const response = await deps.fetch(`${base}/qris/status/${encodeURIComponent(orderId)}`, {
    headers: { 'x-api-key': qris.apiKey, id_merchant: qris.merchantId },
    signal: timeoutSignal(12000),
  })
  if (!response.ok) return null
  const body = (await response.json().catch(() => null)) as
    | { status?: unknown; data?: Record<string, unknown> }
    | null
  if (body?.status !== true) return null
  const data = body.data ?? {}
  const status = typeof data.status === 'string' ? data.status.toUpperCase() : ''
  if (!status) return null
  return {
    status,
    total_amount: data.total_amount,
    signature: typeof data.signature === 'string' ? data.signature : '',
    paid_at: data.paid_at,
  }
}

const MAX_BODY_BYTES = 8192

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

  const outcome = await handleSettle(
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
