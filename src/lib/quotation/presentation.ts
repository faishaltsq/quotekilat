import type { QuoteSnapshot } from './quote'

const dateFormatter = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
})
const moneyFormatter = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 })

/** An allowlist projection: never spread pricing/cost data into customer exports. */
export function getCustomerQuoteLines(quote: QuoteSnapshot): string[] {
  const { details, pricing } = quote
  const date = new Date(quote.createdAt)
  const expiry = new Date(date)
  expiry.setUTCDate(expiry.getUTCDate() + details.validDays)
  const money = (amount: number) => `Rp${moneyFormatter.format(amount)}`
  const fractionalUnitPrice = pricing.finalPrice % quote.quantity !== 0
  const average = fractionalUnitPrice
    ? `Rp${new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(pricing.finalPrice / quote.quantity)} (perkiraan)`
    : money(pricing.finalPrice / quote.quantity)

  return [
    `Nomor: ${quote.id}`,
    `Tanggal (UTC): ${dateFormatter.format(date)}`,
    ...(details.validDays > 0
      ? [`Berlaku sampai: ${dateFormatter.format(expiry)} (${details.validDays} hari)`]
      : []),
    ...(details.businessName.trim() ? [`Usaha: ${details.businessName}`] : []),
    ...(details.customerName.trim() ? [`Pelanggan: ${details.customerName}`] : []),
    '',
    `Item: ${details.title}`,
    `Jumlah: ${quote.quantity} unit`,
    `Harga rata-rata/unit: ${average}`,
    '',
    `Subtotal (dibulatkan): ${money(pricing.roundedPrice)}`,
    `Diskon: ${money(pricing.discountAmount)}`,
    `Total: ${money(pricing.finalPrice)}`,
    'Belum termasuk pajak.',
    ...(details.notes.trim() ? ['', 'Catatan:', details.notes] : []),
  ]
}
