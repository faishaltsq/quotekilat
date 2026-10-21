import { readMidtransEnv, verifySignature, type MidtransEnv } from '../_lib/midtrans'
import { callRpcAsService, readServiceConfig, type ServerConfig } from '../_lib/supabase'

export type WebhookDeps = {
  fetch: typeof fetch
  env: NodeJS.ProcessEnv
  service: ServerConfig | null
  midtrans: MidtransEnv | null
}

export type WebhookResponse = { status: number; json: Record<string, unknown> }

type Notification = {
  order_id?: unknown
  status_code?: unknown
  gross_amount?: unknown
  signature_key?: unknown
  transaction_status?: unknown
  fraud_status?: unknown
  transaction_id?: unknown
  payment_type?: unknown
}

const MAX_BODY_BYTES = 8192

/**
 * Midtrans calls this with no user session. The signature is the only
 * authentication: it is an HMAC-like digest over the order id, status code,
 * amount and our server key, so a forged body cannot be produced without the
 * key. A bad signature answers 401 (visible in the dashboard) while a duplicate
 * answers 200 so the provider stops retrying.
 */
export async function handleWebhook(
  input: { body: unknown; bytes?: number },
  deps: WebhookDeps,
): Promise<WebhookResponse> {
  if ((input.bytes ?? 0) > MAX_BODY_BYTES) {
    return { status: 413, json: { error: { code: 'too_long' } } }
  }
  if (!deps.midtrans || !deps.service) {
    return { status: 503, json: { error: { code: 'disabled' } } }
  }

  const body = input.body as Notification | null
  const orderId = typeof body?.order_id === 'string' ? body.order_id : ''
  const statusCode = typeof body?.status_code === 'string' ? body.status_code : ''
  const grossAmount = typeof body?.gross_amount === 'string' ? body.gross_amount : ''
  const signatureKey = typeof body?.signature_key === 'string' ? body.signature_key : ''
  const transactionStatus = typeof body?.transaction_status === 'string' ? body.transaction_status : ''

  if (!orderId || !statusCode || !grossAmount || !signatureKey || !transactionStatus) {
    return { status: 422, json: { error: { code: 'invalid' } } }
  }

  const valid = verifySignature({
    orderId, statusCode, grossAmount, signatureKey, serverKey: deps.midtrans.serverKey,
  })
  if (!valid) return { status: 401, json: { error: { code: 'bad_signature' } } }

  const result = await callRpcAsService(
    'apply_billing_event',
    {
      p_order_id: orderId,
      p_transaction_status: transactionStatus,
      p_status_code: statusCode,
      p_gross_amount: grossAmount,
      p_fraud_status: typeof body?.fraud_status === 'string' ? body.fraud_status : '',
      p_transaction_id: typeof body?.transaction_id === 'string' ? body.transaction_id : '',
      p_payment_type: typeof body?.payment_type === 'string' ? body.payment_type : '',
    },
    deps.service,
    deps.fetch,
  )

  const row = Array.isArray(result.data) ? (result.data[0] as { applied?: boolean; reason?: string } | undefined) : null
  if (!result.ok || !row) {
    // A 5xx makes Midtrans retry, which is what we want when the database is down.
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

  const outcome = await handleWebhook(
    { body, bytes: raw.length },
    { fetch, env: process.env, service: readServiceConfig(), midtrans: readMidtransEnv() },
  )
  return Response.json(outcome.json, { status: outcome.status })
}
