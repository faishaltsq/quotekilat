import { readSearchEnv, searchSources, type SearchEnv, type SearchSource } from '../_lib/search'
import { callRpc, readCaller, readServerConfig, type ServerConfig } from '../_lib/supabase'
import { buildMarketResult, type MarketResult, type RawSource } from '../../src/lib/market/schema'

export type MarketDeps = {
  fetch: typeof fetch
  env: NodeJS.ProcessEnv
  config: ServerConfig | null
  search: SearchEnv | null
}

export type MarketResponse = { status: number; json: Record<string, unknown> }

const error = (status: number, code: string, message: string): MarketResponse => ({
  status,
  json: { error: { code, message } },
})

type QuotaRow = { allowed: boolean; remaining: number; reason: string | null }

const MAX_QUERY_CHARS = 300

const asString = (value: unknown): string => (typeof value === 'string' ? value : '')
const asPrice = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value)
  if (typeof value === 'string') {
    const digits = value.replace(/[^\d]/g, '')
    return digits ? Number(digits) : 0
  }
  return 0
}

const toRawSource = (source: SearchSource): RawSource => ({
  title: asString(source.title),
  url: asString(source.url),
  priceIdr: asPrice(source.priceIdr),
  unit: asString(source.unit),
  observedAt: asString(source.observedAt),
  region: asString(source.region),
  specs: asString(source.specs),
})

/**
 * Market research never recommends a price: it reports what was found, and below
 * three comparables it reports nothing numeric at all. The quota is charged
 * before the provider call and refunded when the call fails, so a provider
 * outage cannot silently eat a paying user's allowance.
 */
export async function handleMarketResearch(
  input: { authorization: string | null; body: unknown },
  deps: MarketDeps,
): Promise<MarketResponse> {
  const payload = input.body as { query?: unknown } | null
  const query = asString(payload?.query).trim().slice(0, MAX_QUERY_CHARS)
  if (!query) return error(422, 'invalid', 'Tulis dulu barang atau jasa yang ingin dicek.')

  const token = (input.authorization ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return error(401, 'unauthorized', 'Masuk dulu untuk memakai harga pasar.')
  if (!deps.config) return error(503, 'disabled', 'Harga pasar belum aktif di server ini.')
  if (!deps.search) return error(503, 'disabled', 'Harga pasar belum aktif di server ini.')

  const caller = await readCaller(token, deps.config, deps.fetch)
  if (!caller) return error(401, 'unauthorized', 'Sesi berakhir. Masuk lagi.')

  const idempotencyKey = crypto.randomUUID()
  const begun = await callRpc(
    'begin_market_research',
    { p_idempotency_key: idempotencyKey, p_ip_hash: '' },
    token,
    deps.config,
    deps.fetch,
  )
  const row = Array.isArray(begun.data) ? (begun.data[0] as QuotaRow | undefined) : (begun.data as QuotaRow | null)
  if (!begun.ok || !row) return error(502, 'upstream', 'Gagal memeriksa kuota. Coba lagi.')
  if (!row.allowed) {
    const message = row.reason === 'ip_limit'
      ? 'Terlalu banyak permintaan dari jaringan ini. Coba lagi nanti.'
      : 'Kuota harga pasar bulan ini sudah habis.'
    return error(409, 'quota', message)
  }

  const found = await searchSources(query, deps.search, deps.fetch)
  if (!found.ok) {
    await callRpc('refund_market_research', { p_idempotency_key: idempotencyKey }, token, deps.config, deps.fetch)
    return error(502, 'upstream', 'Penyedia pencarian sedang tidak tersedia. Kuota dikembalikan.')
  }

  const result: MarketResult = buildMarketResult({
    query,
    sources: found.sources.map(toRawSource),
    checkedAt: new Date().toISOString(),
  })
  return { status: 200, json: { result, remaining: row.remaining } }
}

const MAX_BODY_BYTES = 4096

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

  const outcome = await handleMarketResearch(
    { authorization: request.headers.get('authorization'), body },
    { fetch, env: process.env, config: readServerConfig(), search: readSearchEnv() },
  )
  return Response.json(outcome.json, { status: outcome.status })
}
