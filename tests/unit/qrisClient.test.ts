import { describe, expect, it, vi } from 'vitest'
import {
  createQrisTransaction,
  readQrisEnv,
  qrisBaseUrl,
  MIN_QRIS_AMOUNT,
} from '../../server/_lib/qris'

const env = { apiKey: 'kq-key', merchantId: 'kq-merchant', isProduction: false }

const okBody = {
  status: true,
  data: {
    order_id: 'QK-20261022-ABCDEFGHIJ',
    amount: 59000,
    total_amount: 59042,
    status: 'PENDING',
    qris_url: 'https://klikqris.test/qr/1.png',
    qris_image: 'data:image/png;base64,AAA',
    expired_at: '2026-10-22T08:30:00Z',
    signature: 'sig-abc',
  },
}

describe('readQrisEnv', () => {
  it('reads the three required values', () => {
    expect(readQrisEnv({ KLIKQRIS_API_KEY: 'a', KLIKQRIS_MERCHANT_ID: 'b' })).toEqual({
      apiKey: 'a',
      merchantId: 'b',
      isProduction: false,
    })
  })

  it('treats a partial config as not configured', () => {
    expect(readQrisEnv({ KLIKQRIS_API_KEY: 'a' })).toBeNull()
    expect(readQrisEnv({ KLIKQRIS_MERCHANT_ID: 'b' })).toBeNull()
    expect(readQrisEnv({})).toBeNull()
  })

  it('treats blank values as missing rather than passing them through', () => {
    expect(readQrisEnv({ KLIKQRIS_API_KEY: '  ', KLIKQRIS_MERCHANT_ID: 'b' })).toBeNull()
  })

  it('reads production from the environment', () => {
    expect(readQrisEnv({ KLIKQRIS_API_KEY: 'a', KLIKQRIS_MERCHANT_ID: 'b', KLIKQRIS_ENV: 'production' }))
      .toMatchObject({ isProduction: true })
  })
})

describe('qrisBaseUrl', () => {
  it('uses the sandbox host unless production is explicit', () => {
    expect(qrisBaseUrl({ ...env, isProduction: false })).toBe('https://klikqris.com/api/sandbox')
    expect(qrisBaseUrl({ ...env, isProduction: true })).toBe('https://klikqris.com/api')
  })
})

describe('createQrisTransaction', () => {
  const request = { orderId: 'QK-20261022-ABCDEFGHIJ', amountIdr: 59000, description: 'QuoteKilat Pro' }

  it('refuses an amount below the gateway floor without calling out', async () => {
    const fetchImpl = vi.fn()
    const outcome = await createQrisTransaction(
      { ...request, amountIdr: MIN_QRIS_AMOUNT - 1 },
      env,
      fetchImpl as unknown as typeof fetch,
    )
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.kind).toBe('amount')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('posts the documented shape and returns the QRIS session', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => okBody }) as Response)
    const outcome = await createQrisTransaction(request, env, fetchImpl as unknown as typeof fetch)

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://klikqris.com/api/sandbox/qris/create')
    const headers = init.headers as Record<string, string>
    expect(headers['x-api-key']).toBe('kq-key')
    expect(headers.id_merchant).toBe('kq-merchant')
    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    expect(body.order_id).toBe(request.orderId)
    expect(body.amount).toBe(59000)
    expect(body.id_merchant).toBe('kq-merchant')

    expect(outcome.ok).toBe(true)
    if (outcome.ok) {
      expect(outcome.session.totalIdr).toBe(59042)
      expect(outcome.session.uniqueCode).toBe(42)
      expect(outcome.session.signature).toBe('sig-abc')
      expect(outcome.session.imageUrl).toBe('https://klikqris.test/qr/1.png')
      expect(outcome.session.expiredAt).toBe('2026-10-22T08:30:00.000Z')
    }
  })

  it('normalises the gateway shape captured from a live sandbox response', async () => {
    // Copied verbatim from a real POST /qris/create response (2026-10-22):
    // amounts are decimal strings, expired_at is WIB wall-clock with no zone.
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({
        status: true,
        message: 'Transaction Created Successfully',
        data: {
          order_id: 'QK-20261022-ABCDEFGHIJ',
          amount: '59000.00',
          amount_uniq: '565.00',
          total_amount: '59565.00',
          status: 'PENDING',
          qris_url: 'https://klikqris.com/storage/qris_api/qris_X.png',
          qris_image: 'data:image/png;base64,AAA',
          expired_at: '2026-10-22 17:19:15',
          signature: 'ygzOPsMVszrJY6AR5nFCX3gLsRkMfP1792660756',
        },
      }),
    }) as Response)
    const outcome = await createQrisTransaction(request, env, fetchImpl as unknown as typeof fetch)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.session.totalIdr).toBe(59565)
    expect(outcome.session.uniqueCode).toBe(565)
    expect(outcome.session.amountIdr).toBe(59000)
    // 17:19:15 WIB is 10:19:15Z; a naive read would store 17:19Z and keep a
    // dead QR payable for seven extra hours.
    expect(outcome.session.expiredAt).toBe('2026-10-22T10:19:15.000Z')
  })

  it('reports a gateway rejection instead of throwing', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 422,
      json: async () => ({ status: false, message: 'Validation Error' }),
    }) as Response)
    const outcome = await createQrisTransaction(request, env, fetchImpl as unknown as typeof fetch)
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) {
      expect(outcome.kind).toBe('status')
      expect(outcome.detail).toContain('Validation')
    }
  })

  it('reports a network failure as its own kind', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('ECONNRESET') })
    const outcome = await createQrisTransaction(request, env, fetchImpl as unknown as typeof fetch)
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.kind).toBe('network')
  })

  it('treats a response with no signature as unusable', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: true, data: { ...okBody.data, signature: undefined } }),
    }) as Response)
    const outcome = await createQrisTransaction(request, env, fetchImpl as unknown as typeof fetch)
    // Without a signature the webhook could never verify the order, so this is
    // a hard failure rather than a session the buyer can pay into.
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.kind).toBe('shape')
  })
})
