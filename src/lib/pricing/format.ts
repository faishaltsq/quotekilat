const rupiahFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const percentFormatter = new Intl.NumberFormat('id-ID', {
  style: 'percent',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

/** A null margin means there was no revenue; it is not a zero-percent margin. */
export function formatPercent(bps: number | null): string {
  if (bps === null) return '—'
  if (!Number.isFinite(bps)) {
    throw new RangeError('Nilai persen harus berupa angka terbatas atau null.')
  }
  return percentFormatter.format(bps === 0 ? 0 : bps / 10_000)
}

/** Whole-IDR display; fractional average unit prices are rounded for presentation only. */
export function formatIDR(value: number): string {
  if (!Number.isFinite(value)) {
    throw new RangeError('Nilai rupiah harus berupa angka terbatas.')
  }
  // An ordinary space keeps the same output usable in the UI, clipboard, and PDF.
  return rupiahFormatter.format(value === 0 ? 0 : value).replace(/\u00a0|\u202f/g, ' ')
}
