import { describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { createSnapTransaction, readMidtransEnv, signatureFor, verifySignature } from '../../server/_lib/midtrans'

const env = { serverKey: 'SB-Mid-server-TESTKEY', clientKey: 'SB-Mid-client-TESTKEY', isProduction: false }

describe('readMidtransEnv', () => {
  it('returns null when either key is missing', () => {
    expect(readMidtransEnv({} as NodeJS.ProcessEnv)).toBeNull()
    expect(readMidtransEnv({ MIDTRANS_SERVER_KEY: 'x' } as NodeJS.ProcessEnv)).toBeNull()
  })

  it('defaults to sandbox', () => {
    const parsed = readMidtransEnv({ MIDTRANS_SERVER_KEY: 'a', MIDTRANS_CLIENT_KEY: 'b' } as NodeJS.ProcessEnv)
    expect(parsed?.isProduction).toBe(false)
  })

  it('reads the production flag from an exact string', () => {
    const parsed = readMidtransEnv({
      MIDTRANS_SERVER_KEY: 'a', MIDTRANS_CLIENT_KEY: 'b', MIDTRANS_IS_PRODUCTION: 'true',
    } as NodeJS.ProcessEnv)
    expect(parsed?.isProduction).toBe(true)
  })
})

describe('signature', () => {
  const input = { orderId: 'QK-20260101-ABCDEFGHIJ', statusCode: '200', grossAmount: '59000.00', serverKey: env.serverKey }

  it('is sha512 of order+status+amount+key', () => {
    expect(signatureFor(input)).toBe(
      createHash('sha512').update('QK-20260101-ABCDEFGHIJ20059000.00SB-Mid-server-TESTKEY').digest('hex'),
    )
  })

  it('accepts the matching signature case-insensitively', () => {
    expect(verifySignature({ ...input, signatureKey: signatureFor(input).toUpperCase() })).toBe(true)
  })

  it('rejects a signature for a different amount', () => {
    const wrong = signatureFor({ ...input, grossAmount: '1000.00' })
    expect(verifySignature({ ...input, signatureKey: wrong })).toBe(false)
  })

  it('rejects a truncated signature without throwing', () => {
    expect(verifySignature({ ...input, signatureKey: 'abc' })).toBe(false)
  })
})

describe('createSnapTransaction', () => {
  const ok = (body: unknown, status = 201) => ({ ok: status < 400, status, json: async () => body }) as Response

  it('posts to the sandbox host with basic auth and the server-chosen amount', async () => {
    let seenUrl = ''
    let seenAuth = ''
    let seenBody: Record<string, unknown> = {}
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      seenUrl = String(url)
      seenAuth = String((init.headers as Record<string, string>).authorization)
      seenBody = JSON.parse(String(init.body))
      return ok({ token: 'snap-token', redirect_url: 'https://app.sandbox.midtrans.com/snap/v4/redirection/snap-token' })
    }) as unknown as typeof fetch

    const result = await createSnapTransaction(
      { orderId: 'QK-20260101-ABCDEFGHIJ', amountIdr: 59000, plan: 'pro', customerEmail: 'a@example.test' },
      env, fetchImpl,
    )

    expect(seenUrl).toBe('https://app.sandbox.midtrans.com/snap/v1/transactions')
    expect(seenAuth).toBe(`Basic ${Buffer.from(`${env.serverKey}:`).toString('base64')}`)
    expect(seenBody).toMatchObject({
      transaction_details: { order_id: 'QK-20260101-ABCDEFGHIJ', gross_amount: 59000 },
    })
    expect(result).toEqual({ ok: true, token: 'snap-token', redirectUrl: 'https://app.sandbox.midtrans.com/snap/v4/redirection/snap-token' })
  })

  it('reports a provider rejection instead of throwing', async () => {
    const fetchImpl = vi.fn(async () => ok({ error_messages: ['amount is required'] }, 400)) as unknown as typeof fetch
    const result = await createSnapTransaction(
      { orderId: 'QK-20260101-ABCDEFGHIJ', amountIdr: 59000, plan: 'pro', customerEmail: null }, env, fetchImpl,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.kind).toBe('status')
  })

  it('reports a network failure instead of throwing', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('ECONNRESET') }) as unknown as typeof fetch
    const result = await createSnapTransaction(
      { orderId: 'QK-20260101-ABCDEFGHIJ', amountIdr: 59000, plan: 'pro', customerEmail: null }, env, fetchImpl,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.kind).toBe('network')
  })
})
