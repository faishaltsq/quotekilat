import { createHash, timingSafeEqual } from 'node:crypto'
import { timeoutSignal } from './net'

export type MidtransEnv = { serverKey: string; clientKey: string; isProduction: boolean }

/** Server-only credentials. `MIDTRANS_*` has no VITE_ prefix, so Vite never inlines them. */
export function readMidtransEnv(env: NodeJS.ProcessEnv = process.env): MidtransEnv | null {
  const serverKey = env.MIDTRANS_SERVER_KEY?.trim() ?? ''
  const clientKey = env.MIDTRANS_CLIENT_KEY?.trim() ?? ''
  if (!serverKey || !clientKey) return null
  return { serverKey, clientKey, isProduction: env.MIDTRANS_IS_PRODUCTION === 'true' }
}

export const snapBase = (env: MidtransEnv): string =>
  env.isProduction ? 'https://app.midtrans.com' : 'https://app.sandbox.midtrans.com'

/**
 * Midtrans signs `order_id + status_code + gross_amount + server_key` with
 * SHA-512. The server key is the secret half, so a forged notification cannot
 * produce a matching digest without it.
 */
export function signatureFor(input: {
  orderId: string
  statusCode: string
  grossAmount: string
  serverKey: string
}): string {
  return createHash('sha512')
    .update(`${input.orderId}${input.statusCode}${input.grossAmount}${input.serverKey}`)
    .digest('hex')
}

export function verifySignature(input: {
  orderId: string
  statusCode: string
  grossAmount: string
  serverKey: string
  signatureKey: string
}): boolean {
  const expected = signatureFor(input)
  const given = input.signatureKey.trim().toLowerCase()
  // Length check first: timingSafeEqual throws on a length mismatch, and a
  // truncated signature is an ordinary attack, not a crash.
  if (given.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(expected), Buffer.from(given))
}

export type SnapRequest = {
  orderId: string
  amountIdr: number
  plan: string
  customerEmail: string | null
}

export type SnapOutcome =
  | { ok: true; token: string; redirectUrl: string }
  | { ok: false; kind: 'network' | 'status' | 'shape'; status?: number; detail?: string }

export async function createSnapTransaction(
  request: SnapRequest,
  env: MidtransEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<SnapOutcome> {
  const authorization = `Basic ${Buffer.from(`${env.serverKey}:`).toString('base64')}`

  let response: Response
  try {
    response = await fetchImpl(`${snapBase(env)}/snap/v1/transactions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', authorization },
      body: JSON.stringify({
        transaction_details: { order_id: request.orderId, gross_amount: request.amountIdr },
        ...(request.customerEmail ? { customer_details: { email: request.customerEmail } } : {}),
        // finish is the only callback we ask for: the browser returns to our own
        // page and reads the truth from /api/billing/status, never from the URL.
        callbacks: { finish: `${env.isProduction ? 'https://quotekilat.vercel.app' : 'http://127.0.0.1:4173'}/#harga` },
        credit_card: { secure: true },
      }),
      signal: timeoutSignal(15000),
    })
  } catch {
    return { ok: false, kind: 'network' }
  }

  const body = (await response.json().catch(() => null)) as
    | { token?: string; redirect_url?: string; error_messages?: string[] }
    | null

  if (!response.ok) {
    return { ok: false, kind: 'status', status: response.status, detail: body?.error_messages?.[0] ?? '' }
  }
  if (!body?.token || !body?.redirect_url) return { ok: false, kind: 'shape' }

  return { ok: true, token: body.token, redirectUrl: body.redirect_url }
}
