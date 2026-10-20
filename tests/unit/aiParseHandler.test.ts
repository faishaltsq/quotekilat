import { describe, expect, it, vi } from 'vitest'
import { handleParse, hashIp, type ParseDeps } from '../../api/ai/parse-quote'

const KEY = 'aaaaaaaa-0000-0000-0000-000000000001'
const config = { url: 'https://abcd.supabase.co', key: 'sb_publishable_test' }
const configured = { baseUrl: 'https://model.example/v1', apiKey: 'sk-test', model: 'test-model' }

type Handler = () => { ok: boolean; status: number; body: unknown }
type RpcHandler = (name: string, args: Record<string, unknown>) => { ok: boolean; status: number; body: unknown }

const response = ({ ok, status, body }: { ok: boolean; status: number; body: unknown }) => ({
  ok,
  status,
  json: async () => body,
})

function makeDeps(overrides: {
  auth?: Handler
  rpc?: RpcHandler
  model?: Handler
  provider?: typeof configured | Record<string, never>
  calls?: { model: string[]; rpc: string[] }
}): ParseDeps {
  const calls = overrides.calls ?? { model: [], rpc: [] }
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/auth/v1/user')) {
      return response(overrides.auth?.() ?? { ok: true, status: 200, body: { id: 'user-1', email: null } })
    }
    if (url.includes('/rest/v1/rpc/')) {
      const name = url.split('/').pop() as string
      calls.rpc.push(name)
      const args = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}
      const result = overrides.rpc?.(name, args) ?? { ok: true, status: 200, body: [{ allowed: true, remaining: 1, reason: null }] }
      return response(result)
    }
    calls.model.push(String(init?.body ?? ''))
    return response(overrides.model?.() ?? { ok: true, status: 200, body: { choices: [{ message: { content: '{"mode":"goods","fields":{"unitCost":60000}}' } }] } })
  }) as unknown as typeof fetch

  return {
    fetch: fetchImpl,
    env: {} as NodeJS.ProcessEnv,
    config,
    provider: (overrides.provider ?? configured) as typeof configured,
    ipHash: 'iphash',
  }
}

const ask = (deps: ParseDeps, input: { authorization?: string | null; body?: unknown; bytes?: number } = {}) =>
  handleParse(
    {
      authorization: input.authorization === undefined ? 'Bearer jwt' : input.authorization,
      body: input.body === undefined ? { text: 'Hampers 25 pcs, kain 60rb per pcs', idempotencyKey: KEY } : input.body,
      bytes: input.bytes ?? 0,
    },
    deps,
  )

describe('handleParse refusals', () => {
  it('requires a token', async () => {
    const result = await ask(makeDeps({}), { authorization: null })
    expect(result.status).toBe(401)
    expect(result.json).toMatchObject({ error: { code: 'unauthorized' } })
  })

  it('rejects a request without an idempotency key', async () => {
    const result = await ask(makeDeps({}), { body: { text: 'apa saja' } })
    expect(result.status).toBe(422)
  })

  it('rejects empty text', async () => {
    const result = await ask(makeDeps({}), { body: { text: '   ', idempotencyKey: KEY } })
    expect(result.status).toBe(422)
  })

  it('rejects text over the limit', async () => {
    const result = await ask(makeDeps({}), { body: { text: 'a'.repeat(1201), idempotencyKey: KEY } })
    expect(result.status).toBe(413)
  })

  it('rejects an oversized body before parsing it', async () => {
    const result = await ask(makeDeps({}), { bytes: 9000 })
    expect(result.status).toBe(413)
  })

  it('refuses when the server has no Supabase credentials', async () => {
    const deps = { ...makeDeps({}), config: null }
    const result = await ask(deps)
    expect(result.status).toBe(503)
  })

  it('refuses an expired session', async () => {
    const result = await ask(makeDeps({ auth: () => ({ ok: false, status: 401, body: { error: 'invalid token' } }) }))
    expect(result.status).toBe(401)
  })
})

describe('handleParse quota', () => {
  it('charges before calling the model and reports what is left', async () => {
    const calls = { model: [] as string[], rpc: [] as string[] }
    const result = await ask(makeDeps({ calls }))
    expect(result.status).toBe(200)
    expect(calls.rpc).toEqual(['begin_ai_parse'])
    expect(calls.model).toHaveLength(1)
    expect(result.json).toMatchObject({ mock: false, remaining: 1, mode: 'goods' })
    expect(result.json.fields).toEqual({ unitCost: 60000 })
  })

  it('refuses with 409 when the monthly allowance is spent, without calling the model', async () => {
    const calls = { model: [] as string[], rpc: [] as string[] }
    const result = await ask(makeDeps({ calls, rpc: () => ({ ok: true, status: 200, body: [{ allowed: false, remaining: 0, reason: 'quota' }] }) }))
    expect(result.status).toBe(409)
    expect(result.json).toMatchObject({ error: { code: 'quota' } })
    expect(calls.model).toHaveLength(0)
  })

  it('returns 429 for the per-IP ceiling, not quota', async () => {
    const result = await ask(makeDeps({ rpc: () => ({ ok: true, status: 200, body: [{ allowed: false, remaining: 1, reason: 'ip_limit' }] }) }))
    expect(result.status).toBe(429)
    expect(result.json).toMatchObject({ error: { code: 'ip_limit' } })
  })

  it('does not call the model when the quota RPC itself fails', async () => {
    const calls = { model: [] as string[], rpc: [] as string[] }
    const result = await ask(makeDeps({ calls, rpc: () => ({ ok: false, status: 500, body: { message: 'boom' } }) }))
    expect(result.status).toBe(502)
    expect(calls.model).toHaveLength(0)
  })
})

describe('handleParse provider failures', () => {
  it('refunds the unit and says so when the model errors', async () => {
    const calls = { model: [] as string[], rpc: [] as string[] }
    const result = await ask(makeDeps({ calls, model: () => ({ ok: false, status: 500, body: {} }) }))
    expect(result.status).toBe(502)
    expect(calls.rpc).toEqual(['begin_ai_parse', 'refund_ai_parse'])
    expect(String((result.json as { error: { message: string } }).error.message)).toContain('dikembalikan')
  })

  it('refunds on a timeout too', async () => {
    const calls = { model: [] as string[], rpc: [] as string[] }
    const deps = makeDeps({ calls })
    const failing = {
      ...deps,
      fetch: vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input)
        if (url.endsWith('/auth/v1/user')) return response({ ok: true, status: 200, body: { id: 'user-1' } })
        if (url.includes('/rest/v1/rpc/')) {
          calls.rpc.push(url.split('/').pop() as string)
          return response({ ok: true, status: 200, body: [{ allowed: true, remaining: 1, reason: null }] })
        }
        void init
        throw Object.assign(new Error('aborted'), { name: 'TimeoutError' })
      }) as unknown as typeof fetch,
    }
    const result = await ask(failing)
    expect(calls.rpc).toEqual(['begin_ai_parse', 'refund_ai_parse'])
    expect(String((result.json as { error: { message: string } }).error.message)).toContain('terlalu lama')
  })
})

describe('handleParse privacy', () => {
  it('redacts identifiers before the text leaves the process', async () => {
    const calls = { model: [] as string[], rpc: [] as string[] }
    const result = await ask(
      makeDeps({ calls }),
      { body: { text: 'kirim ke budi@example.com / 081234567890, kain 60rb', idempotencyKey: KEY } },
    )
    const sent = calls.model[0]
    expect(sent).not.toContain('budi@example.com')
    expect(sent).not.toContain('081234567890')
    expect(sent).toContain('60rb')
    expect(result.json.redactedCount).toBe(2)
  })

  it('never puts the api key in the response', async () => {
    const result = await ask(makeDeps({}))
    expect(JSON.stringify(result.json)).not.toContain('sk-test')
  })
})

describe('handleParse mock mode', () => {
  it('answers honestly, charges nothing, and applies nothing', async () => {
    const calls = { model: [] as string[], rpc: [] as string[] }
    const result = await ask(makeDeps({ calls, provider: {} }))
    expect(result.status).toBe(200)
    expect(result.json).toMatchObject({ mock: true, mode: null, fields: {}, remaining: null })
    expect(calls.rpc).toHaveLength(0)
  })
})

describe('hashIp', () => {
  it('is stable, salted and never the raw address', () => {
    const a = hashIp('203.0.113.7', 'pepper')
    expect(a).toBe(hashIp('203.0.113.7', 'pepper'))
    expect(a).not.toBe(hashIp('203.0.113.7', 'other'))
    expect(a).not.toContain('203.0.113.7')
    expect(a).toHaveLength(32)
  })

  it('treats a missing address as one unknown bucket', () => {
    expect(hashIp(null, 'p')).toBe(hashIp('', 'p'))
    expect(hashIp(null, 'p')).not.toBe(hashIp('203.0.113.7', 'p'))
  })
})
