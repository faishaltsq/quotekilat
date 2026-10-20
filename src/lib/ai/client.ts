import { aiParseResponseSchema, normalizePayload, type AiParseResult } from './schema'

export type AiParseErrorCode =
  | 'unauthorized'
  | 'quota'
  | 'ip_limit'
  | 'rate'
  | 'too_long'
  | 'invalid'
  | 'upstream'
  | 'offline'
  | 'disabled'

export type AiParseError = { code: AiParseErrorCode; message: string }
export type AiParseOutcome = { ok: true; data: AiParseResult } | { ok: false; error: AiParseError }

const MESSAGES: Record<AiParseErrorCode, string> = {
  unauthorized: 'Sesi berakhir. Masuk lagi untuk memakai Smart Input.',
  quota: 'Kuota Smart Input bulan ini sudah habis.',
  ip_limit: 'Terlalu banyak permintaan dari jaringan ini. Coba lagi dalam satu jam.',
  rate: 'Permintaan terlalu cepat. Tunggu sebentar lalu coba lagi.',
  too_long: 'Teks terlalu panjang. Ringkas catatan Anda.',
  invalid: 'Teks belum bisa dibaca. Tulis ulang dengan angka yang jelas.',
  upstream: 'Layanan AI sedang bermasalah. Kuota Anda tidak terpakai.',
  offline: 'Tidak ada koneksi ke server. Kuota Anda tidak terpakai.',
  disabled: 'Smart Input belum aktif di server ini.',
}

export function newIdempotencyKey(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export const aiErrorMessage = (code: AiParseErrorCode): string => MESSAGES[code]

function statusToCode(status: number): AiParseErrorCode {
  if (status === 401 || status === 403) return 'unauthorized'
  if (status === 409) return 'quota'
  if (status === 413) return 'too_long'
  if (status === 422) return 'invalid'
  if (status === 429) return 'rate'
  if (status === 503) return 'disabled'
  return 'upstream'
}

/** Server sends { error: { code } } for refusals; the code is trusted over the status. */
function codeFromBody(body: unknown, status: number): AiParseErrorCode {
  const code = (body as { error?: { code?: string } } | null)?.error?.code
  if (code === 'ip_limit' || code === 'quota' || code === 'unauthorized' || code === 'too_long' || code === 'invalid' || code === 'disabled') return code
  return statusToCode(status)
}

export async function requestAiParse(input: {
  text: string
  token: string
  idempotencyKey: string
  endpoint?: string
  signal?: AbortSignal
}): Promise<AiParseOutcome> {
  let response: Response
  try {
    response = await fetch(input.endpoint ?? '/api/ai/parse', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${input.token}` },
      body: JSON.stringify({ text: input.text, idempotencyKey: input.idempotencyKey }),
      signal: input.signal,
    })
  } catch {
    return { ok: false, error: { code: 'offline', message: MESSAGES.offline } }
  }

  const body: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const code = codeFromBody(body, response.status)
    const serverMessage = (body as { error?: { message?: string } } | null)?.error?.message
    return { ok: false, error: { code, message: serverMessage?.trim() || MESSAGES[code] } }
  }

  const parsed = aiParseResponseSchema.safeParse(body)
  if (!parsed.success) return { ok: false, error: { code: 'upstream', message: MESSAGES.upstream } }
  return { ok: true, data: normalizePayload(parsed.data) }
}
