import { timeoutSignal } from './net'

/** KlikQRIS is QRIS-only: one API key, one merchant id, no Snap token, no redirect. */
export type QrisEnv = { apiKey: string; merchantId: string; isProduction: boolean }

/**
 * Lowest nominal the gateway accepts. Below it KlikQRIS answers 422
 * "Validation Error", a message the buyer cannot act on, so the floor is
 * enforced here with a message that names the real limit.
 */
export const MIN_QRIS_AMOUNT = 1000

export function readQrisEnv(env: NodeJS.ProcessEnv = process.env): QrisEnv | null {
  const apiKey = env.KLIKQRIS_API_KEY?.trim() ?? ''
  const merchantId = env.KLIKQRIS_MERCHANT_ID?.trim() ?? ''
  if (!apiKey || !merchantId) return null
  return { apiKey, merchantId, isProduction: env.KLIKQRIS_ENV === 'production' }
}

export const qrisBaseUrl = (env: QrisEnv): string =>
  env.isProduction ? 'https://klikqris.com/api' : 'https://klikqris.com/api/sandbox'

/**
 * The gateway returns `expired_at` as WIB wall-clock ("2026-10-22 17:19:15")
 * with no zone, and amounts as decimal strings ("59565.00"). Storing the
 * timestamp as-is would make Postgres read it as UTC, so a dead QR code would
 * stay payable for seven extra hours.
 */
const WIB_OFFSET_MS = -7 * 60 * 60 * 1000 // UTC+7

export function parseGatewayTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const raw = value.trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(raw)
  if (!m) {
    // Already carries a zone (or is malformed): let Date judge it.
    const parsed = new Date(raw)
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
  }
  const [, y, mo, d, h, mi, s] = m.map(Number) as unknown as number[]
  const wallMs = Date.UTC(y!, (mo ?? 1) - 1, d ?? 1, h ?? 0, mi ?? 0, s ?? 0)
  return new Date(wallMs + WIB_OFFSET_MS).toISOString()
}

const toIdr = (value: unknown): number => {
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n) : NaN
}

export type QrisSession = {
  orderId: string
  amountIdr: number
  /** What the buyer actually pays: the plan price plus the gateway unique code. */
  totalIdr: number
  uniqueCode: number
  status: string
  imageUrl: string
  payload: string
  expiredAt: string | null
  /** Issued at creation and compared timing-safe by the webhook. */
  signature: string
}

export type QrisOutcome =
  | { ok: true; session: QrisSession }
  | { ok: false; kind: 'amount' | 'network' | 'status' | 'shape'; status?: number; detail?: string }

type CreateRequest = { orderId: string; amountIdr: number; description: string }

/**
 * Creates one QRIS transaction. The response carries the signature that the
 * webhook later trusts, so a response without one is unusable: the order could
 * never be settled, and accepting it would leave the buyer with a QR code that
 * pays into nothing.
 */
export async function createQrisTransaction(
  request: CreateRequest,
  env: QrisEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<QrisOutcome> {
  if (!Number.isInteger(request.amountIdr) || request.amountIdr < MIN_QRIS_AMOUNT) {
    return {
      ok: false,
      kind: 'amount',
      detail: `Nominal Rp ${request.amountIdr} di bawah minimum QRIS (Rp ${MIN_QRIS_AMOUNT}).`,
    }
  }

  let response: Response
  try {
    response = await fetchImpl(`${qrisBaseUrl(env)}/qris/create`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.apiKey,
        id_merchant: env.merchantId,
      },
      body: JSON.stringify({
        order_id: request.orderId,
        id_merchant: env.merchantId,
        amount: request.amountIdr,
        keterangan: request.description,
      }),
      signal: timeoutSignal(15000),
    })
  } catch {
    return { ok: false, kind: 'network' }
  }

  const body = (await response.json().catch(() => null)) as
    | { status?: unknown; message?: unknown; data?: Record<string, unknown> }
    | null

  if (!response.ok || body?.status !== true) {
    return {
      ok: false,
      kind: 'status',
      status: response.status,
      detail: typeof body?.message === 'string' ? body.message : '',
    }
  }

  const data = body.data ?? {}
  const signature = typeof data.signature === 'string' ? data.signature : ''
  if (!signature) return { ok: false, kind: 'shape', detail: 'missing signature' }

  const amountIdr = toIdr(data.amount ?? request.amountIdr)
  const totalIdr = toIdr(data.total_amount ?? amountIdr)
  if (!Number.isFinite(totalIdr) || totalIdr < amountIdr) return { ok: false, kind: 'shape', detail: 'bad total' }

  return {
    ok: true,
    session: {
      orderId: typeof data.order_id === 'string' ? data.order_id : request.orderId,
      amountIdr,
      totalIdr,
      uniqueCode: Math.max(0, totalIdr - amountIdr),
      status: typeof data.status === 'string' ? data.status : 'PENDING',
      imageUrl: typeof data.qris_url === 'string' ? data.qris_url : '',
      payload: typeof data.qris_image === 'string' ? data.qris_image : '',
      expiredAt: parseGatewayTimestamp(data.expired_at),
      signature,
    },
  }
}
