import { Download, FileText, MessageCircle } from 'lucide-react'
import type { QuoteSnapshot } from '../../lib/quotation/quote'
import { formatIDR } from '../../lib/pricing/format'

type Props = {
  quote: QuoteSnapshot | null
  busy: boolean
  onCopy: () => void
  onPdf: () => void
}

const dateFormatter = new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeZone: 'UTC' })

/** Always-on customer-facing preview. Internal costs and margin never appear here. */
export function LiveInvoicePreview({ quote, busy, onCopy, onPdf }: Props) {
  return (
    <aside className="live-invoice" aria-label="Pratinjau penawaran langsung">
      <div className="live-invoice-head">
        <span className="eyebrow">Pratinjau penawaran</span>
        <span className="live-flag">
          <span className="live-dot" aria-hidden="true" />
          Realtime
        </span>
      </div>

      <div className="live-actions">
        <button type="button" className="button button-secondary" disabled={!quote} onClick={onCopy}>
          <MessageCircle size={16} aria-hidden="true" /> Salin WhatsApp
        </button>
        <button type="button" className="button button-primary" disabled={!quote || busy} onClick={onPdf}>
          <Download size={16} aria-hidden="true" /> {busy ? 'Membuat PDF…' : 'Unduh PDF'}
        </button>
      </div>

      <div className="live-paper">
        {quote ? (
          <div className="quote-paper">
            <div className="quote-paper-heading">
              <div>
                <span className="eyebrow">PENAWARAN HARGA</span>
                <h2>{quote.details.businessName || 'Penawaran Anda'}</h2>
              </div>
              <span className="quote-brand">QuoteKilat</span>
            </div>
            <div className="quote-meta">
              <span>{quote.id}</span>
              <span>Tanggal (UTC): {dateFormatter.format(new Date(quote.createdAt))}</span>
            </div>
            {quote.details.customerName && (
              <p className="customer-line">
                Kepada Yth. <strong>{quote.details.customerName}</strong>
              </p>
            )}
            <div className="quote-line-item">
              <div>
                <h3>{quote.details.title}</h3>
                <p>{quote.mode === 'service' ? '1 paket layanan' : `${quote.quantity} unit`}</p>
              </div>
              <strong>{formatIDR(quote.pricing.roundedPrice)}</strong>
            </div>
            <dl className="quote-totals">
              <div>
                <dt>Subtotal</dt>
                <dd>{formatIDR(quote.pricing.roundedPrice)}</dd>
              </div>
              {quote.pricing.discountAmount > 0 && (
                <div>
                  <dt>Diskon</dt>
                  <dd>−{formatIDR(quote.pricing.discountAmount)}</dd>
                </div>
              )}
              <div className="quote-grand-total" aria-live="polite" aria-atomic="true">
                <dt>Total penawaran</dt>
                <dd>{formatIDR(quote.pricing.finalPrice)}</dd>
              </div>
            </dl>
            <div className="quote-terms">
              <p>Harga belum termasuk pajak.</p>
              <p>
                {quote.details.validDays
                  ? `Berlaku ${quote.details.validDays} hari sejak tanggal penawaran.`
                  : 'Masa berlaku belum ditentukan.'}
              </p>
              {quote.details.notes && <p className="preserve-lines">{quote.details.notes}</p>}
            </div>
            <div className="quote-signature">
              <div>
                <span>Disiapkan oleh</span>
                <strong>{quote.details.businessName || 'QuoteKilat'}</strong>
              </div>
              <div>
                <span>Disetujui oleh</span>
                <strong>{quote.details.customerName || 'Pelanggan'}</strong>
              </div>
            </div>
            <p className="quote-paper-footer">Terima kasih atas kepercayaan Anda.</p>
          </div>
        ) : (
          <p className="live-empty">Isi nama item dan biaya untuk melihat penawaran di sini.</p>
        )}
      </div>

      <p className="live-note">
        <FileText size={12} aria-hidden="true" />
        Biaya internal dan margin tidak ikut diekspor.
      </p>
    </aside>
  )
}
