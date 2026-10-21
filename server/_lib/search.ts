import { timeoutSignal } from './net'

/**
 * Search-grounded provider config. All three values are required: a partial
 * config would silently query the wrong endpoint, so it reads as "not
 * configured" and the route answers 503 instead of guessing.
 */
export type SearchEnv = { baseUrl: string; apiKey: string; model: string }

export function readSearchEnv(env: NodeJS.ProcessEnv = process.env): SearchEnv | null {
  const baseUrl = env.SEARCH_BASE_URL?.trim() ?? ''
  const apiKey = env.SEARCH_API_KEY?.trim() ?? ''
  const model = env.SEARCH_MODEL?.trim() ?? ''
  if (!baseUrl || !apiKey || !model) return null
  return { baseUrl, apiKey, model }
}

export type SearchSource = {
  title?: unknown
  url?: unknown
  priceIdr?: unknown
  unit?: unknown
  observedAt?: unknown
  region?: unknown
  specs?: unknown
}

const MAX_SOURCES = 12

/**
 * One grounded completion. The model is asked for JSON only and the response is
 * parsed defensively: anything unparseable yields an empty list, which the
 * comparability gate then turns into the insufficient-data state.
 */
export async function searchSources(
  query: string,
  config: SearchEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: boolean; sources: SearchSource[] }> {
  const response = await fetchImpl(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content:
            'Anda mengumpulkan penawaran harga barang/jasa Indonesia yang benar-benar ditemukan di web. ' +
            'Jawab HANYA JSON: {"sources":[{"title","url","priceIdr","unit","observedAt","region","specs"}]}. ' +
            'priceIdr adalah integer rupiah tanpa titik. Jangan mengarang sumber, harga, atau URL. ' +
            'Jika tidak menemukan penawaran nyata, jawab {"sources":[]}.',
        },
        { role: 'user', content: query.slice(0, 300) },
      ],
    }),
    signal: timeoutSignal(25_000),
  }).catch(() => null)

  if (!response?.ok) return { ok: false, sources: [] }
  const body = (await response.json().catch(() => null)) as
    | { choices?: { message?: { content?: unknown } }[] }
    | null

  const content = body?.choices?.[0]?.message?.content
  if (typeof content !== 'string') return { ok: false, sources: [] }

  const json = content.match(/\{[\s\S]*\}/)?.[0] ?? ''
  try {
    const parsed = JSON.parse(json) as { sources?: unknown }
    const sources = Array.isArray(parsed.sources) ? (parsed.sources as SearchSource[]) : []
    return { ok: true, sources: sources.slice(0, MAX_SOURCES) }
  } catch {
    return { ok: true, sources: [] }
  }
}
