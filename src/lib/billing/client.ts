export type BillingPlan = 'free' | 'pro'

export type BillingStatus = {
  plan: BillingPlan
  currentPeriodEnd: string | null
  limits: { aiParse: number; quotes: number; marketResearch: number }
  remaining: { aiParse: number; quotes: number }
}

export type BillingErrorCode = 'unauthorized' | 'disabled' | 'upstream' | 'invalid' | 'offline' | 'unknown'

type Failure = { ok: false; code: BillingErrorCode; message: string }

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

export async function startCheckout(input: {
  token: string
  plan: BillingPlan
  fetchImpl?: typeof fetch
}): Promise<{ ok: true; orderId: string; redirectUrl: string } | Failure> {
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
    | { orderId?: string; redirectUrl?: string; error?: { code?: string } }
    | null

  if (!response.ok) {
    const code = codeFrom(body, response.status)
    return { ok: false, code, message: MESSAGES[code] }
  }

  // Only a real https URL is allowed to navigate away: an attacker who could
  // influence this response must not be able to produce a javascript: target.
  const url = body?.redirectUrl ?? ''
  if (!body?.orderId || !/^https:\/\/[^\s]+$/i.test(url)) {
    return { ok: false, code: 'unknown', message: MESSAGES.unknown }
  }

  return { ok: true, orderId: body.orderId, redirectUrl: url }
}
