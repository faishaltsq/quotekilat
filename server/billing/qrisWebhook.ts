import { timingSafeEqual } from 'node:crypto'
import { parseGatewayTimestamp, readQrisEnv, type QrisEnv } from '../_lib/qris'
import { callRpcAsService, readServiceConfig, type ServerConfig } from '../_lib/supabase'

export type QrisWebhookDeps = {
  fetch: typeof fetch
  env: NodeJS.ProcessEnv
  service: ServerConfig | null
  qris: QrisEnv | null
}

export type WebhookResponse = { status: number; json: Record<string, unknown> }

type Notification = {
  order_id?: unknown
  status?: unknown
  total_amount?: unknown
  amount?: unknown
  signature?: unknown
  paid_at?: unknown
  payment_date?: unknown
  transaction_id?: unknown
  data?: Record<string, unknown>
}

type OrderRow = { qris_signature: string | null; status: string; total_idr: number | null; amount_idr: number }

const MAX_BODY_BYTES = 8192

const str = (value: unknown): string => (typeof value === 'string' ? value : '')

/** The gateway sends either a flat body or the same fields under `data`. */
function normalise(body: Notification | null) {
  const nested = body?.data ?? {}
  const orderId = str(body?.order_id) || str(nested.order_id)
  const status = (str(body?.status) || str(nested.status)).toUpperCase()
  const rawTotal = body?.total_amount ?? nested.total_amount ?? body?.amount ?? nested.amount_paid ?? nested.amount
  const totalAmount = Number(rawTotal ?? 0)
  const signature = str(body?.signature) || str(nested.signature)
  // The live gateway sends paid_at (WIB wall-clock); payment_date does not
  // exist, but is kept as a fallback so an older payload still records a time.
  const paidAt = parseGatewayTimestamp(
    body?.paid_at ?? nested.paid_at ?? body?.payment_date ?? nested.payment_date,
  )
  const gatewayRef = str(body?.transaction_id) || str(nested.transaction_id)
  return { orderId, status, totalAmount, signature, paidAt, gatewayRef }
}

const signatureMatches = (stored: string, given: string): boolean => {
  const a = Buffer.from(stored, 'utf-8')
  const b = Buffer.from(given, 'utf-8')
  // Length first: timingSafeEqual throws on a mismatch, and a truncated
  // signature is an ordinary attack rather than a crash.
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/**
 * KlikQRIS calls this with no user session, so the per-order signature is the
 * only authentication: it was issued at creation and stored on the order, so a
 * forged body cannot produce it. A bad signature answers 401 (visible in the
 * dashboard) while a duplicate answers 200 so the gateway stops retrying.
 */
export async function handleQrisWebhook(
  input: { body: unknown; bytes?: number },
  deps: QrisWebhookDeps,
): Promise<WebhookResponse> {
  if ((input.bytes ?? 0) > MAX_BODY_BYTES) {
    return { status: 413, json: { error: { code: 'too_long' } } }
  }
  if (!deps.qris || !deps.service) {
    return { status: 503, json: { error: { code: 'disabled' } } }
  }

  const { orderId, status, totalAmount, signature, paidAt, gatewayRef } = normalise(input.body as Notification | null)
  if (!orderId || !status) return { status: 422, json: { error: { code: 'invalid' } } }
  if (!signature) return { status: 401, json: { error: { code: 'bad_signature' } } }

  const lookup = await deps.fetch(
    `${deps.service.url}/rest/v1/billing_orders?order_id=eq.${encodeURIComponent(orderId)}&select=qris_signature,status,total_idr,amount_idr&limit=1`,
    {
      headers: { apikey: deps.service.key, authorization: `Bearer ${deps.service.key}` },
    },
  ).catch(() => null)

  if (!lookup?.ok) return { status: 502, json: { error: { code: 'upstream' } } }

  const rows = (await lookup.json().catch(() => null)) as OrderRow[] | null
  const order = Array.isArray(rows) ? rows[0] : undefined
  if (!order) return { status: 404, json: { error: { code: 'unknown_order' } } }

  // A row created before this phase has no signature. Treating that as "no
  // check needed" would let anyone who guesses the order id claim it.
  if (!order.qris_signature || !signatureMatches(order.qris_signature, signature)) {
    return { status: 401, json: { error: { code: 'bad_signature' } } }
  }

  const expected = order.total_idr ?? order.amount_idr
  if (!Number.isFinite(totalAmount) || totalAmount <= 0 || totalAmount < expected) {
    return { status: 400, json: { error: { code: 'underpaid' } } }
  }

  const result = await callRpcAsService(
    'apply_qris_event',
    {
      p_order_id: orderId,
      p_status: status,
      p_total_amount: Math.round(totalAmount),
      p_paid_at: paidAt || null,
      p_gateway_ref: gatewayRef,
    },
    deps.service,
    deps.fetch,
  )

  const row = Array.isArray(result.data) ? (result.data[0] as { applied?: boolean; reason?: string } | undefined) : null
  if (!result.ok || !row) {
    // A 5xx makes the gateway retry, which is what we want when the database
    // is briefly down.
    return { status: 502, json: { error: { code: 'upstream' } } }
  }

  return { status: 200, json: { applied: row.applied === true, reason: row.reason ?? null } }
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return Response.json({ error: { code: 'method' } }, { status: 405 })
  }
  const raw = await request.text()
  let body: unknown
  try { body = JSON.parse(raw) } catch { body = null }

  const outcome = await handleQrisWebhook(
    { body, bytes: raw.length },
    { fetch, env: process.env, service: readServiceConfig(), qris: readQrisEnv() },
  )
  return Response.json(outcome.json, { status: outcome.status })
}
