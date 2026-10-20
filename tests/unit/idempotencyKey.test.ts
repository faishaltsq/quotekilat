import { describe, expect, it } from 'vitest'
import { newIdempotencyKey } from '../../src/lib/cloud/useCloudQuotes'
import { isUuid } from '../../src/lib/cloud/quoteMapping'

describe('newIdempotencyKey', () => {
  it('produces a valid v4 UUID', () => {
    const key = newIdempotencyKey()
    expect(isUuid(key)).toBe(true)
    expect(key[14]).toBe('4')
    expect(['8', '9', 'a', 'b']).toContain(key[19])
  })

  it('never repeats across many calls', () => {
    const keys = new Set(Array.from({ length: 500 }, () => newIdempotencyKey()))
    expect(keys.size).toBe(500)
  })

  it('still produces a valid UUID when crypto.randomUUID is unavailable', () => {
    const original = crypto.randomUUID
    // Older Safari and non-secure contexts lack randomUUID entirely.
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true })
    try {
      const key = newIdempotencyKey()
      expect(isUuid(key)).toBe(true)
      expect(key[14]).toBe('4')
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true })
    }
  })
})
