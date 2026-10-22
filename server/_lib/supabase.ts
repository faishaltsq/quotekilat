import { timeoutSignal } from './net'

export type ServerConfig = { url: string; key: string }

/** Server-side Supabase credentials. Deliberately not VITE_-prefixed: these never
 *  belong in a browser bundle, and the publishable key is only used here to verify
 *  a caller's own token. */
export function readServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig | null {
  const url = env.SUPABASE_URL?.trim() ?? ''
  const key = env.SUPABASE_PUBLISHABLE_KEY?.trim() ?? env.SUPABASE_ANON_KEY?.trim() ?? ''
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) || !key) return null
  if (key.startsWith('sb_secret_')) return null
  return { url: url.replace(/\/$/, ''), key }
}

export type Caller = { id: string; email: string | null }

export async function readCaller(
  token: string,
  config: ServerConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<Caller | null> {
  const response = await fetchImpl(`${config.url}/auth/v1/user`, {
    headers: { apikey: config.key, authorization: `Bearer ${token}` },
    signal: timeoutSignal(8000),
  }).catch(() => null)
  if (!response?.ok) return null
  const body = (await response.json().catch(() => null)) as { id?: string; email?: string } | null
  if (!body?.id) return null
  return { id: body.id, email: body.email ?? null }
}

export type RpcOutcome = { ok: boolean; status: number; data: unknown }

export async function callRpc(
  name: string,
  args: Record<string, unknown>,
  token: string,
  config: ServerConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<RpcOutcome> {
  const response = await fetchImpl(`${config.url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: config.key,
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(args),
    signal: timeoutSignal(8000),
  }).catch(() => null)

  if (!response) return { ok: false, status: 0, data: null }
  const data: unknown = await response.json().catch(() => null)
  return { ok: response.ok, status: response.status, data }
}

/**
 * The webhook has no user session: the payment gateway calls us. It authenticates with the
 * service-role key, which is read here and never returned to a caller. A
 * publishable key is rejected outright so a misconfigured deploy fails closed.
 */
export function readServiceConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig | null {
  const url = env.SUPABASE_URL?.trim() ?? ''
  const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? ''
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) || !key) return null
  if (!key.startsWith('sb_secret_') && !key.startsWith('eyJ')) return null
  return { url: url.replace(/\/$/, ''), key }
}

/** Same call shape as `callRpc`, but authenticates as the service role. */
export async function callRpcAsService(
  name: string,
  args: Record<string, unknown>,
  config: ServerConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<RpcOutcome> {
  let response: Response
  try {
    response = await fetchImpl(`${config.url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: config.key,
        authorization: `Bearer ${config.key}`,
      },
      body: JSON.stringify(args),
      signal: timeoutSignal(10000),
    })
  } catch {
    return { ok: false, status: 0, data: null }
  }
  const data = await response.json().catch(() => null)
  return { ok: response.ok, status: response.status, data }
}
