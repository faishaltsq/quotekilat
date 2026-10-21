import { describe, expect, it } from 'vitest'
import { ALLOWED_EVENTS, buildEvent, scrubProps } from '../../src/lib/analytics/events'

describe('ALLOWED_EVENTS', () => {
  it('is a closed list', () => {
    expect(ALLOWED_EVENTS).toContain('quote_completed')
    expect(ALLOWED_EVENTS).toContain('pdf_downloaded')
    expect(ALLOWED_EVENTS).toContain('smart_input_applied')
    expect(ALLOWED_EVENTS).toContain('checkout_started')
  })
})

describe('scrubProps', () => {
  it('drops any key that is not on the allow list', () => {
    expect(scrubProps({ mode: 'goods', customerName: 'Budi', notes: 'rahasia' })).toEqual({ mode: 'goods' })
  })

  it('drops free text values even under an allowed key', () => {
    expect(scrubProps({ mode: 'a very long sentence that is clearly free text' })).toEqual({})
  })

  it('keeps short enumerated values and integers', () => {
    expect(scrubProps({ mode: 'goods', quantity: 25, marginBucket: '30-40' }))
      .toEqual({ mode: 'goods', quantity: 25, marginBucket: '30-40' })
  })

  it('never keeps a value longer than 40 characters', () => {
    expect(scrubProps({ marginBucket: 'x'.repeat(41) })).toEqual({})
  })
})

describe('buildEvent', () => {
  it('produces a stable shape with no identifiers', () => {
    const event = buildEvent('quote_completed', { mode: 'goods', quantity: 3 })
    expect(Object.keys(event).sort()).toEqual(['name', 'props', 'ts'])
    expect(event.name).toBe('quote_completed')
    expect(event.props).toEqual({ mode: 'goods', quantity: 3 })
    expect(typeof event.ts).toBe('string')
  })

  it('refuses an unknown event name', () => {
    expect(() => buildEvent('customer_email_captured' as never, {})).toThrow()
  })
})
