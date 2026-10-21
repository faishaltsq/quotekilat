import { afterEach, describe, expect, it, vi } from 'vitest'
import { track } from '../../src/lib/analytics/track'
import { CONSENT_KEY } from '../../src/lib/analytics/consent'

describe('track', () => {
  afterEach(() => { localStorage.clear(); vi.restoreAllMocks() })

  it('does nothing without consent', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    track('quote_completed', { mode: 'goods' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('posts to our own origin when consent is granted', () => {
    localStorage.setItem(CONSENT_KEY, 'granted')
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }))
    track('quote_completed', { mode: 'goods', customerName: 'Budi' })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/analytics/collect')
    expect(JSON.parse(String(init.body)).props).toEqual({ mode: 'goods' })
  })

  it('does not throw when the network fails', () => {
    localStorage.setItem(CONSENT_KEY, 'granted')
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'))
    expect(() => track('quote_completed', {})).not.toThrow()
  })
})
