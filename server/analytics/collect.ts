/**
 * Deliberately minimal: no database write in this phase. The route exists so the
 * client has a same-origin target, the vocabulary is enforced server-side too,
 * and a later phase can persist aggregates without changing the contract.
 *
 * A 204 is returned even when the body is fine but nothing is stored: the client
 * must never branch on analytics success.
 */
const ALLOWED_EVENTS = new Set([
  'quote_completed', 'pdf_downloaded', 'whatsapp_copied', 'cloud_quote_saved',
  'smart_input_applied', 'checkout_started', 'market_research_run', 'plan_viewed',
])

const ALLOWED_PROPS = new Set(['mode', 'quantity', 'marginBucket', 'plan', 'result', 'source'])
const MAX_BODY_BYTES = 2048

export type CollectDeps = {
  fetch: typeof fetch
  env: NodeJS.ProcessEnv
  config: { url: string; key: string } | null
}

export type CollectResponse = { status: number; json: Record<string, unknown> }

export async function handleCollect(
  input: { body: unknown; bytes?: number },
  deps: CollectDeps,
): Promise<CollectResponse> {
  // No persistence in this phase; the dependency is accepted so a later phase can
  // add a database write without changing the handler signature.
  void deps
  if ((input.bytes ?? 0) > MAX_BODY_BYTES) return { status: 413, json: { error: { code: 'too_long' } } }

  const body = input.body as { name?: unknown; props?: unknown } | null
  const name = typeof body?.name === 'string' ? body.name : ''
  if (!ALLOWED_EVENTS.has(name)) return { status: 422, json: { error: { code: 'invalid' } } }

  const props = body?.props
  if (props !== undefined && (typeof props !== 'object' || props === null)) {
    return { status: 422, json: { error: { code: 'invalid' } } }
  }
  for (const key of Object.keys((props ?? {}) as Record<string, unknown>)) {
    if (!ALLOWED_PROPS.has(key)) return { status: 422, json: { error: { code: 'invalid' } } }
  }

  return { status: 204, json: {} }
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return new Response(null, { status: 405 })
  const raw = await request.text()
  let body: unknown
  try { body = JSON.parse(raw) } catch { body = null }

  const outcome = await handleCollect({ body, bytes: raw.length }, { fetch, env: process.env, config: null })
  return new Response(outcome.status === 204 ? null : JSON.stringify(outcome.json), {
    status: outcome.status,
    headers: outcome.status === 204 ? undefined : { 'content-type': 'application/json' },
  })
}
