import { describe, expect, it } from 'vitest'
import { formatIDR, formatPercent } from '../../src/lib/pricing/format'

describe('formatIDR', () => {
  it.each([
    { value: 0, expected: 'Rp 0' },
    { value: -0, expected: 'Rp 0' },
    { value: 175_000, expected: 'Rp 175.000' },
    { value: -175_200, expected: '-Rp 175.200' },
    { value: 1_234.5, expected: 'Rp 1.235' },
    { value: 100_000_000_000_000, expected: 'Rp 100.000.000.000.000' },
  ])('menampilkan $value dalam IDR berformat Indonesia', ({ value, expected }) => {
    expect(formatIDR(value)).toBe(expected)
  })

  it.each([NaN, Infinity, -Infinity])('menolak angka non-finite: %s', value => {
    expect(() => formatIDR(value)).toThrow(RangeError)
    expect(() => formatIDR(value)).toThrow(/rupiah.*harus/i)
  })
})

describe('formatPercent', () => {
  it.each([
    { value: null, expected: '—' },
    { value: 0, expected: '0%' },
    { value: -0, expected: '0%' },
    { value: 3_000, expected: '30%' },
    { value: 2_506.993006993007, expected: '25,07%' },
    { value: -1_420, expected: '-14,2%' },
    { value: 1, expected: '0,01%' },
    { value: 10_000, expected: '100%' },
  ])('menampilkan $value basis points sebagai $expected', ({ value, expected }) => {
    expect(formatPercent(value)).toBe(expected)
  })

  it.each([NaN, Infinity, -Infinity])('menolak margin non-finite: %s', value => {
    expect(() => formatPercent(value)).toThrow(RangeError)
    expect(() => formatPercent(value)).toThrow(/persen.*harus/i)
  })
})
