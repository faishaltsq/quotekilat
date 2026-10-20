import { CircleCheck, TriangleAlert } from 'lucide-react'
import type { PricingResult } from '../../lib/pricing/types'
import { formatIDR, formatPercent } from '../../lib/pricing/format'
export function PricingSummary({ result, error, quantity }: { result: PricingResult | null; error?: string; quantity: number }) {
  return <div className="pricing-summary" aria-live="polite" aria-atomic="true">
    <div className="result-heading"><span>Harga jual penawaran</span><span className="result-tag">{result?.discountAmount ? 'Setelah diskon' : 'Dibulatkan ke atas'}</span></div>
    <output aria-label="Harga jual penawaran" className="selling-price">{result ? formatIDR(result.finalPrice) : '—'}</output>
    {!result ? <p className="calculation-error" role="alert">{error || 'Lengkapi input yang ditandai untuk menghitung harga.'}</p> : <>
      <dl className="result-breakdown"><div><dt>Biaya dasar</dt><dd>{formatIDR(result.baseCost)}</dd></div><div><dt>Fee penjualan total</dt><dd>{formatIDR(result.sellingFees)}</dd></div>
      {result.discountAmount > 0 && <><div><dt>Sebelum diskon</dt><dd>{formatIDR(result.roundedPrice)}</dd></div><div><dt>Potongan diskon</dt><dd>−{formatIDR(result.discountAmount)}</dd></div></>}
      <div className="profit-row"><dt>Estimasi laba kotor</dt><dd>{formatIDR(result.profit)}</dd></div><div><dt>Gross margin aktual</dt><dd>{formatPercent(result.actualMarginBps)}</dd></div>
      {quantity > 1 && <div><dt>Rata-rata / unit</dt><dd>{formatIDR(result.unitPrice)}</dd></div>}</dl>
      <div className={`margin-guard ${result.belowTarget ? 'below-target' : ''}`}>{result.belowTarget ? <TriangleAlert size={15} /> : <CircleCheck size={15} />}<span>{result.belowTarget ? 'Margin di bawah target. Tinjau diskon atau biaya.' : 'Target margin terpenuhi.'}</span></div>
    </>}
    <p className="tax-note">Belum termasuk pajak. Perhitungan ini bukan harga pasar.</p>
  </div>
}
