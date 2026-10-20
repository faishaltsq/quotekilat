import { describe, expect, it, vi } from 'vitest'
import { callProvider, isConfigured, ProviderError, readProviderEnv } from '../../server/_lib/provider'

const configured = { baseUrl: 'https://model.example/v1', apiKey: 'sk-test', model: 'test-model' }

const fakeFetch = (payload: unknown, status = 200) =>
  vi.fn(async () => ({ ok: status < 400, status, json: async () => payload })) as unknown as typeof fetch

const completion = (content: string) => ({ choices: [{ message: { content } }] })

describe('readProviderEnv', () => {
  it('reads server-only names and ignores VITE_ variables', () => {
    const env = readProviderEnv({ AI_BASE_URL: ' https://x/v1 ', AI_MODEL: 'm', AI_API_KEY: 'k', VITE_AI_API_KEY: 'leak' } as NodeJS.ProcessEnv)
    expect(env).toEqual({ baseUrl: 'https://x/v1', apiKey: 'k', model: 'm' })
  })

  it('is unconfigured when any part is missing', () => {
    expect(isConfigured(readProviderEnv({} as NodeJS.ProcessEnv))).toBe(false)
    expect(isConfigured({ baseUrl: 'https://x/v1', apiKey: 'k' })).toBe(false)
    expect(isConfigured(configured)).toBe(true)
  })
})

describe('callProvider', () => {
  it('answers with a labelled mock when no key is configured', async () => {
    const result = await callProvider('kain 60rb', {}, fakeFetch({}))
    expect(result.mock).toBe(true)
    expect(result.payload.fields).toEqual({})
    expect(result.payload.assumptions.join(' ')).toContain('belum aktif')
  })

  it('sends a deterministic, JSON-only request', async () => {
    const fetchMock = fakeFetch(completion('{"mode":"goods","fields":{"unitCost":60000}}'))
    await callProvider('kain 60rb', configured, fetchMock)
    const [url, init] = (fetchMock as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]
    expect(url).toBe('https://model.example/v1/chat/completions')
    const body = JSON.parse(String(init.body))
    expect(body.model).toBe('test-model')
    expect(body.temperature).toBe(0)
    expect(body.response_format).toEqual({ type: 'json_object' })
    expect(body.messages[0].content).toContain('JANGAN menebak')
  })

  it('parses a fenced JSON answer', async () => {
    const result = await callProvider('x', configured, fakeFetch(completion('```json\n{"mode":"service","fields":{"hourlyCost":75000,"serviceHours":"7,5"}}\n```')))
    expect(result.mock).toBe(false)
    expect(result.payload.fields).toEqual({ hourlyCost: 75000, serviceHours: 7.5 })
  })

  it('drops unknown keys and malformed values the model invents', async () => {
    const result = await callProvider('x', configured, fakeFetch(completion('{"fields":{"unitCost":"gratis","hargaJual":250000,"quantity":3}}')))
    expect(result.payload.fields).toEqual({ quantity: 3 })
  })

  it('caps the lists so one chatty answer cannot flood the panel', async () => {
    const many = Array.from({ length: 12 }, (_, index) => `asumsi ${index}`)
    const result = await callProvider('x', configured, fakeFetch(completion(JSON.stringify({ assumptions: many, missing: many }))))
    expect(result.payload.assumptions).toHaveLength(6)
    expect(result.payload.missing).toHaveLength(8)
  })

  it('fails loudly on a non-2xx answer', async () => {
    await expect(callProvider('x', configured, fakeFetch({}, 500))).rejects.toBeInstanceOf(ProviderError)
  })

  it('fails on an answer that is not JSON', async () => {
    await expect(callProvider('x', configured, fakeFetch(completion('Maaf, saya tidak bisa.')))).rejects.toMatchObject({ kind: 'shape' })
  })

  it('fails on an empty answer', async () => {
    await expect(callProvider('x', configured, fakeFetch({ choices: [] }))).rejects.toMatchObject({ kind: 'shape' })
  })

  it('distinguishes a timeout so the caller can say the quota came back', async () => {
    const timeoutError = Object.assign(new Error('aborted'), { name: 'TimeoutError' })
    const fetchMock = vi.fn(async () => { throw timeoutError }) as unknown as typeof fetch
    await expect(callProvider('x', configured, fetchMock)).rejects.toMatchObject({ kind: 'timeout' })
  })

  it('never sends the api key in the body', async () => {
    const fetchMock = fakeFetch(completion('{"fields":{}}'))
    await callProvider('x', configured, fetchMock)
    const [, init] = (fetchMock as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]
    expect(String(init.body)).not.toContain('sk-test')
  })
})
