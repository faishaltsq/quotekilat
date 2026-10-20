import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type CloudConfig = {
  url: string
  publishableKey: string
}

/**
 * Read the public cloud config. Both values are publishable by design; the
 * service-role key must never reach the bundle, so it is not read here at all.
 */
export function readCloudConfig(env: Record<string, string | undefined> = import.meta.env): CloudConfig | null {
  const url = env.VITE_SUPABASE_URL?.trim()
  const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  if (!url || !publishableKey) return null
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) return null
  // A service-role JWT is a long-lived token with role=service_role; refuse it
  // loudly rather than shipping a full-access credential to every visitor.
  if (publishableKey.startsWith('sb_secret_')) {
    throw new Error('Kunci rahasia Supabase tidak boleh dipakai di browser.')
  }
  return { url, publishableKey }
}

let cached: SupabaseClient | null = null
let cachedKey = ''

export function getSupabaseClient(config: CloudConfig): SupabaseClient {
  const key = `${config.url}::${config.publishableKey}`
  if (cached && cachedKey === key) return cached
  cached = createClient(config.url, config.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      storageKey: 'quotekilat:auth:v1',
    },
  })
  cachedKey = key
  return cached
}

/** Test seam: drop the memoised client so a fresh config is honoured. */
export function resetSupabaseClient(): void {
  cached = null
  cachedKey = ''
}
