import { createHash } from 'node:crypto'
import { MAX_INPUT_CHARS } from '../../src/lib/ai/schema'
import { redactPii } from '../../src/lib/ai/redact'
import { callProvider, isConfigured, ProviderError, readProviderEnv, type ProviderEnv, type ProviderResult } from '../_lib/provider'
import { callRpc, readCaller, readServerConfig, type ServerConfig } from '../_lib/supabase'

const MAX_BODY_BYTES = 8192
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ParseDeps = {
  fetch: typeof fetch
  env: NodeJS.ProcessEnv
  config: ServerConfig | null
  provider: ProviderEnv
  /** Salted hash of the caller's IP. Never the address itself. */
  ipHash: string
}

export type ParseResponse = { status: number; json: Record<string, unknown> }

const error = (status: number, code: string, message: string): ParseResponse => ({
  status,
  json: { error: { code, message } },
})

type ChargeRow = { allowed: boolean; remaining: number; reason: string | null }

export function hashIp(ip: string | null, salt: string): string {
  // Every caller without a resolvable address shares one bucket: an empty and a
  // missing header must not read as two different humans.
  return createHash('sha256').update(`${salt}:${ip?.trim() || 'unknown'}`).digest('hex').slice(0, 32)
}

/**
 * Pure request handler: no request/response objects, so the whole decision tree
 * is unit-testable. The default export below is the thin Web-API wrapper.
 */
export async function handleParse(
  input: { authorization: string | null; body: unknown; bytes?: number },
  deps: ParseDeps,
): Promise<ParseResponse> {
  if ((input.bytes ?? 0) > MAX_BODY_BYTES) return error(413, 'too_long', 'Teks terlalu panjang. Ringkas catatan Anda.')

  const payload = input.body as { text?: unknown; idempotencyKey?: unknown } | null
  const rawText = typeof payload?.text === 'string' ? payload.text : ''
  const idempotencyKey = typeof payload?.idempotencyKey === 'string' ? payload.idempotencyKey : ''
  if (!UUID.test(idempotencyKey)) return error(422, 'invalid', 'Permintaan tidak lengkap. Muat ulang halaman lalu coba lagi.')

  const text = rawText.trim()
  if (!text) return error(422, 'invalid', 'Tulis dulu catatan singkat tentang pesanan Anda.')
  if (text.length > MAX_INPUT_CHARS) return error(413, 'too_long', `Maksimal ${MAX_INPUT_CHARS} karakter. Ringkas catatan Anda.`)

  const token = (input.authorization ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return error(401, 'unauthorized', 'Masuk dulu untuk memakai Smart Input.')

  if (!deps.config) return error(503, 'disabled', 'Smart Input belum aktif di server ini.')

  const caller = await readCaller(token, deps.config, deps.fetch)
  if (!caller) return error(401, 'unauthorized', 'Sesi berakhir. Masuk lagi untuk memakai Smart Input.')

  // Redaction happens before anything leaves the process, and again on the
  // server even though the browser already did it.
  const redaction = redactPii(text)
  const safeText = redaction.text.slice(0, MAX_INPUT_CHARS)

  if (!isConfigured(deps.provider)) {
    const result = await callProvider(safeText, deps.provider, deps.fetch)
    // Mock results are labelled and never charged: a demo must not cost quota
    // and must not look like a successful parse.
    return {
      status: 200,
      json: {
        mock: true,
        mode: null,
        fields: {},
        assumptions: result.payload.assumptions,
        missing: result.payload.missing,
        deadline: null,
        redactedCount: redaction.count,
        remaining: null,
      },
    }
  }

  const charge = await callRpc(
    'begin_ai_parse',
    { p_idempotency_key: idempotencyKey, p_ip_hash: deps.ipHash },
    token,
    deps.config,
    deps.fetch,
  )
  const row = Array.isArray(charge.data) ? (charge.data[0] as ChargeRow | undefined) : undefined
  if (!charge.ok || !row) {
    return error(charge.status === 0 ? 503 : 502, 'upstream', 'Kuota belum bisa diperiksa. Coba lagi.')
  }
  if (!row.allowed) {
    const code = row.reason === 'ip_limit' ? 'ip_limit' : 'quota'
    const message = row.reason === 'ip_limit'
      ? 'Terlalu banyak permintaan dari jaringan ini. Coba lagi dalam satu jam.'
      : 'Kuota Smart Input bulan ini sudah habis.'
    return error(code === 'quota' ? 409 : 429, code, message)
  }

  let result: ProviderResult
  try {
    result = await callProvider(safeText, deps.provider, deps.fetch)
  } catch (caught) {
    // The unit was already charged; a provider failure must not consume it.
    await callRpc('refund_ai_parse', { p_idempotency_key: idempotencyKey }, token, deps.config, deps.fetch)
    const timedOut = caught instanceof ProviderError && caught.kind === 'timeout'
    return error(502, 'upstream', timedOut ? 'Model terlalu lama menjawab. Kuota Anda dikembalikan.' : 'Layanan AI sedang bermasalah. Kuota Anda dikembalikan.')
  }

  return {
    status: 200,
    json: {
      mock: result.mock,
      mode: result.payload.mode,
      fields: result.payload.fields,
      assumptions: result.payload.assumptions,
      missing: result.payload.missing,
      deadline: result.payload.deadline,
      redactedCount: redaction.count,
      remaining: typeof row.remaining === 'number' ? row.remaining : null,
    },
  }
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return Response.json({ error: { code: 'invalid', message: 'Gunakan POST.' } }, { status: 405, headers: { allow: 'POST' } })
  }

  const raw = await request.text()
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return Response.json({ error: { code: 'invalid', message: 'Body bukan JSON.' } }, { status: 400 })
  }

  const env = process.env
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip')
  const result = await handleParse(
    { authorization: request.headers.get('authorization'), body, bytes: raw.length },
    {
      fetch,
      env,
      config: readServerConfig(env),
      provider: readProviderEnv(env),
      ipHash: hashIp(ip, env.AI_IP_PEPPER?.trim() || 'quotekilat'),
    },
  )

  return Response.json(result.json, { status: result.status, headers: { 'cache-control': 'no-store' } })
}
