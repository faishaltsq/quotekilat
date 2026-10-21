import { callRpc, readCaller, readServerConfig, type ServerConfig } from '../_lib/supabase'

export type StatusDeps = {
  fetch: typeof fetch
  env: NodeJS.ProcessEnv
  config: ServerConfig | null
}

export type HandlerResponse = { status: number; json: Record<string, unknown> }

type StatusRow = {
  plan: string
  current_period_end: string | null
  ai_parse_limit: number
  ai_parse_remaining: number
  quote_limit: number
  quote_remaining: number
  market_research_limit: number
}

export async function handleStatus(
  input: { authorization: string | null },
  deps: StatusDeps,
): Promise<HandlerResponse> {
  const token = (input.authorization ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return { status: 401, json: { error: { code: 'unauthorized', message: 'Masuk dulu.' } } }
  if (!deps.config) return { status: 503, json: { error: { code: 'disabled', message: 'Billing belum aktif.' } } }

  const caller = await readCaller(token, deps.config, deps.fetch)
  if (!caller) return { status: 401, json: { error: { code: 'unauthorized', message: 'Sesi berakhir.' } } }

  const result = await callRpc('billing_status', {}, token, deps.config, deps.fetch)
  const row = Array.isArray(result.data) ? (result.data[0] as StatusRow | undefined) : (result.data as StatusRow | null)
  if (!result.ok || !row) {
    return { status: 502, json: { error: { code: 'upstream', message: 'Gagal membaca status langganan.' } } }
  }

  return {
    status: 200,
    json: {
      plan: row.plan,
      currentPeriodEnd: row.current_period_end,
      limits: {
        aiParse: row.ai_parse_limit,
        quotes: row.quote_limit,
        marketResearch: row.market_research_limit,
      },
      remaining: {
        aiParse: row.ai_parse_remaining,
        quotes: row.quote_remaining,
      },
    },
  }
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET') {
    return Response.json({ error: { code: 'method', message: 'GET only.' } }, { status: 405 })
  }
  const outcome = await handleStatus(
  { authorization: request.headers.get('authorization') },
    { fetch, env: process.env, config: readServerConfig() },
  )
  return Response.json(outcome.json, {
    status: outcome.status,
    // A plan read must never be cached by the browser or a CDN.
    headers: { 'cache-control': 'no-store' },
  })
}
