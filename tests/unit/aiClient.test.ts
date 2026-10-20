import { afterEach, describe, expect, it, vi } from 'vitest'
import { newIdempotencyKey, requestAiParse } from '../../src/lib/ai/client'

const body = {
  mock: false,
  mode: 'goods',
  fields: { unitCost: 60000 },
  assumptions: [],
  missing: [],
  deadline: null,
  redactedCount: 0,
  remaining: 1,
}

const respond = (status: number, payload: unknown) =>
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } })))

afterEach(() => vi.unstubAllGlobals())

describe('requestAiParse', () => {
  it('posts the token and the idempotency key', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await requestAiParse({ text: 'kain 60rb', token: 'jwt', idempotencyKey: 'aaaaaaaa-0000-0000-0000-000000000001' })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/ai/parse')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer jwt')
    expect(JSON.parse(String(init.body))).toEqual({ text: 'kain 60rb', idempotencyKey: 'aaaaaaaa-0000-0000-0000-000000000001' })
  })

  it('returns the normalized parse', async () => {
    respond(200, body)
    const outcome = await requestAiParse({ text: 'x', token: 'jwt', idempotencyKey: newIdempotencyKey() })
    expect(outcome.ok).toBe(true)
    if (outcome.ok) expect(outcome.data.fields.unitCost).toBe(60000)
  })

  it('maps a spent quota to its own message', async () => {
    respond(409, { error: { code: 'quota', message: 'Kuota Smart Input bulan ini sudah habis.' } })
    const outcome = await requestAiParse({ text: 'x', token: 'jwt', idempotencyKey: newIdempotencyKey() })
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) {
      expect(outcome.error.code).toBe('quota')
      expect(outcome.error.message).toContain('Kuota')
    }
  })

  it('trusts the body code over the status so an IP block is not reported as quota', async () => {
    respond(429, { error: { code: 'ip_limit' } })
    const outcome = await requestAiParse({ text: 'x', token: 'jwt', idempotencyKey: newIdempotencyKey() })
    if (!outcome.ok) expect(outcome.error.code).toBe('ip_limit')
    else throw new Error('expected failure')
  })

  it('treats an expired session as unauthorized', async () => {
    respond(401, { error: { code: 'unauthorized' } })
    const outcome = await requestAiParse({ text: 'x', token: 'jwt', idempotencyKey: newIdempotencyKey() })
    if (!outcome.ok) expect(outcome.error.code).toBe('unauthorized')
    else throw new Error('expected failure')
  })

  it('reports a dead network without claiming the quota was spent', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    const outcome = await requestAiParse({ text: 'x', token: 'jwt', idempotencyKey: newIdempotencyKey() })
    if (!outcome.ok) {
      expect(outcome.error.code).toBe('offline')
      expect(outcome.error.message).toContain('Kuota Anda tidak terpakai')
    } else throw new Error('expected failure')
  })

  it('rejects a 200 with an unusable body instead of showing half a result', async () => {
    respond(200, { hello: 'world' })
    const outcome = await requestAiParse({ text: 'x', token: 'jwt', idempotencyKey: newIdempotencyKey() })
    if (!outcome.ok) expect(outcome.error.code).toBe('upstream')
    else throw new Error('expected failure')
  })

  it('mints uuid v4 keys', () => {
    expect(newIdempotencyKey()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey())
  })
})
