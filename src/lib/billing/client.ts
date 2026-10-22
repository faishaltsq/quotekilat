export type BillingPlan = 'free' | 'pro'

export type BillingStatus = {
  plan: BillingPlan
  currentPeriodEnd: string | null
  limits: { aiParse: number; quotes: number; marketResearch: number }
  remaining: { aiParse: number; quotes: number }
}

export type BillingErrorCode = 'unauthorized' | 'disabled' | 'upstream' | 'invalid' | 'offline' | 'unknown'

type Failure = { ok: false; code: BillingErrorCode; message: string }

/** What the buyer needs to pay: a QR to scan in place, and the exact total. */
export type QrisSession = {
  imageUrl: string
  payload: string
  amountIdr: number
  uniqueCode: number
  totalIdr: number
  expiredAt: string | null
}

const MESSAGES: Record<BillingErrorCode, string> = {
  unauthorized: 'Masuk dulu untuk melihat status langganan.',
  disabled: 'Langganan belum aktif di server ini.',
  upstream: 'Server pembayaran sedang sibuk. Coba lagi sebentar.',
  invalid: 'Permintaan tidak valid.',
  offline: 'Tidak ada koneksi. Periksa jaringan Anda.',
  unknown: 'Gagal memuat status langganan.',
}

const codeFrom = (body: unknown, status: number): BillingErrorCode => {
  const raw = (body as { error?: { code?: string } } | null)?.error?.code
  if (raw === 'unauthorized' || raw === 'disabled' || raw === 'upstream' || raw === 'invalid') return raw
  if (status === 401) return 'unauthorized'
  if (status === 503) return 'disabled'
  if (status >= 500) return 'upstream'
  return 'unknown'
}

export type SettleResult =
  | { ok: true; applied: boolean; plan: BillingPlan; status: string; reason: string | null }
  | Failure

/**
 * Asks the server to check the payment with the gateway. The browser sends only
 * the order id: whether the money arrived, and how much, is decided by the
 * gateway and re-checked against the order on the server. A success here with
 * `applied: false` means "not paid yet", not "upgraded".
 */
export async function settlePayment(input: {
  token: string
  orderId: string
  fetchImpl?: typeof fetch
}): Promise<SettleResult> {
  const doFetch = input.fetchImpl ?? fetch
  let response: Response
  try {
    response = await doFetch('/api/billing/settle', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${input.token}` },
      body: JSON.stringify({ orderId: input.orderId }),
    })
  } catch {
    return { ok: false, code: 'offline', message: MESSAGES.offline }
  }

  const body = (await response.json().catch(() => null)) as
    | { applied?: boolean; plan?: string; status?: string; reason?: string | null; error?: { code?: string; message?: string } }
    | null

  if (!response.ok) {
    const code = codeFrom(body, response.status)
    // The route explains a mismatch better than the generic message can.
    const detail = typeof body?.error?.message === 'string' ? body.error.message : MESSAGES[code]
    return { ok: false, code, message: detail }
  }

  return {
    ok: true,
    applied: body?.applied === true,
    plan: body?.plan === 'pro' ? 'pro' : 'free',
    status: typeof body?.status === 'string' ? body.status : 'PENDING',
    reason: typeof body?.reason === 'string' ? body.reason : null,
  }
}

export async function fetchBillingStatus(input: {
  token: string
  fetchImpl?: typeof fetch
}): Promise<{ ok: true; status: BillingStatus } | Failure> {
  const doFetch = input.fetchImpl ?? fetch
  let response: Response
  try {
    response = await doFetch('/api/billing/status', {
      headers: { authorization: `Bearer ${input.token}` },
      cache: 'no-store',
    })
  } catch {
    return { ok: false, code: 'offline', message: MESSAGES.offline }
  }

  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const code = codeFrom(body, response.status)
    return { ok: false, code, message: MESSAGES[code] }
  }

  const parsed = body as BillingStatus | null
  if (!parsed || (parsed.plan !== 'free' && parsed.plan !== 'pro')) {
    return { ok: false, code: 'unknown', message: MESSAGES.unknown }
  }
  return { ok: true, status: parsed }
}

/**
 * Starts a QRIS payment. Unlike a hosted checkout there is nowhere to navigate:
 * the caller renders the QR and polls the plan, because the plan only changes
 * when the server has confirmed the payment with the gateway.
 */
export async function startCheckout(input: {
  token: string
  plan: BillingPlan
  fetchImpl?: typeof fetch
}): Promise<{ ok: true; orderId: string; qris: QrisSession } | Failure> {
  const doFetch = input.fetchImpl ?? fetch
  let response: Response
  try {
    response = await doFetch('/api/billing/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${input.token}` },
      body: JSON.stringify({ plan: input.plan }),
    })
  } catch {
    return { ok: false, code: 'offline', message: MESSAGES.offline }
  }

  const body = (await response.json().catch(() => null)) as
    | { orderId?: string; qris?: Partial<QrisSession>; error?: { code?: string } }
    | null

  if (!response.ok) {
    const code = codeFrom(body, response.status)
    return { ok: false, code, message: MESSAGES[code] }
  }

  const qris = body?.qris
  // A session without a scannable code or a positive total is unusable: the
  // buyer would be shown a QR that pays into nothing.
  const imageUrl = typeof qris?.imageUrl === 'string' ? qris.imageUrl : ''
  const payload = typeof qris?.payload === 'string' ? qris.payload : ''
  const totalIdr = Number(qris?.totalIdr ?? 0)
  if (!body?.orderId || (!imageUrl && !payload) || !Number.isFinite(totalIdr) || totalIdr <= 0) {
    return { ok: false, code: 'unknown', message: MESSAGES.unknown }
  }

  return {
    ok: true,
    orderId: body.orderId,
    qris: {
      imageUrl,
      payload,
      amountIdr: Number(qris?.amountIdr ?? totalIdr),
      uniqueCode: Number(qris?.uniqueCode ?? 0),
      totalIdr,
      expiredAt: typeof qris?.expiredAt === 'string' ? qris.expiredAt : null,
    },
  }
}
