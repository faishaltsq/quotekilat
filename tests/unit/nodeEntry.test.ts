import { describe, expect, it, vi } from 'vitest'
import { nodeEntry } from '../../server/_lib/nodeEntry'

const makeRes = () => {
  const headers = new Map<string, string>()
  return {
    statusCode: 0,
    setHeader: (key: string, value: string) => { headers.set(key.toLowerCase(), value) },
    end: vi.fn(),
    get headers() { return headers },
  }
}

const makeReq = (init: { method?: string; url?: string; headers?: Record<string, string>; body?: unknown }) => ({
  method: init.method ?? 'POST',
  url: init.url ?? '/api/test',
  headers: { host: 'quotekilat.test', ...(init.headers ?? {}) },
  body: init.body,
})

describe('nodeEntry', () => {
  it('passes the method, url and headers through to the handler', async () => {
    const seen: { method: string; url: string; header: string | null } = { method: '', url: '', header: null }
    const handler = async (request: Request) => {
      seen.method = request.method
      seen.url = request.url
      seen.header = request.headers.get('x-test')
      return new Response('ok', { status: 201, headers: { 'content-type': 'text/plain' } })
    }
    const res = makeRes()
    await nodeEntry(handler)(makeReq({ headers: { 'x-test': 'yes' } }) as never, res as never)

    expect(seen.method).toBe('POST')
    expect(seen.url).toBe('https://quotekilat.test/api/test')
    expect(seen.header).toBe('yes')
    expect(res.statusCode).toBe(201)
    expect(res.headers.get('content-type')).toBe('text/plain')
  })

  it('serialises a JSON body so the handler can read it', async () => {
    let received = ''
    const handler = async (request: Request) => {
      received = await request.text()
      return new Response(null, { status: 204 })
    }
    await nodeEntry(handler)(makeReq({ body: { hello: 'world' } }) as never, makeRes() as never)
    expect(JSON.parse(received)).toEqual({ hello: 'world' })
  })

  it('sends no body for GET', async () => {
    let received: string | null = 'unset'
    const handler = async (request: Request) => {
      received = await request.text()
      return new Response(null, { status: 200 })
    }
    await nodeEntry(handler)(makeReq({ method: 'GET' }) as never, makeRes() as never)
    expect(received).toBe('')
  })
})
