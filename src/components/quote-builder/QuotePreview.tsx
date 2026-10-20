import * as Dialog from '@radix-ui/react-dialog'
import { Download, MessageCircle, X } from 'lucide-react'
import type { QuoteSnapshot } from '../../lib/quotation/quote'
import { formatIDR } from '../../lib/pricing/format'
export function QuotePreview({ quote, onClose, onCopy, onPdf, busy, onReturnFocus }: { quote: QuoteSnapshot | null; onClose: () => void; onReturnFocus: () => void; onCopy: () => void; onPdf: () => void; busy: boolean }) {
  return <Dialog.Root open={!!quote} onOpenChange={(open) => { if (!open) onClose() }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="quote-dialog" onCloseAutoFocus={(event) => { event.preventDefault(); onReturnFocus() }}><Dialog.Title className="sr-only">Pratinjau penawaran</Dialog.Title><Dialog.Description className="preview-description">Periksa detail sebelum dibagikan. Biaya internal dan margin tidak ikut diekspor.</Dialog.Description><Dialog.Close className="icon-button dialog-close" aria-label="Tutup pratinjau"><X size={20} /></Dialog.Close>
    {quote && <><div className="quote-paper"><div className="quote-paper-heading"><div><span className="eyebrow">PENAWARAN HARGA</span><h2>{quote.details.businessName || 'Penawaran Anda'}</h2></div><span className="quote-brand">QuoteKilat</span></div>
      <div className="quote-meta"><span>{quote.id}</span><span>Tanggal (UTC): {new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(quote.createdAt))}</span></div>
      {quote.details.customerName && <p className="customer-line">Kepada Yth. <strong>{quote.details.customerName}</strong></p>}
      <div className="quote-line-item"><div><h3>{quote.details.title}</h3><p>{quote.mode === 'service' ? '1 paket layanan' : `${quote.quantity} unit`}</p></div><strong>{formatIDR(quote.pricing.roundedPrice)}</strong></div>
      <dl className="quote-totals"><div><dt>Subtotal</dt><dd>{formatIDR(quote.pricing.roundedPrice)}</dd></div>{quote.pricing.discountAmount > 0 && <div><dt>Diskon</dt><dd>−{formatIDR(quote.pricing.discountAmount)}</dd></div>}<div className="quote-grand-total"><dt>Total penawaran</dt><dd>{formatIDR(quote.pricing.finalPrice)}</dd></div></dl>
      <div className="quote-terms"><p>Harga belum termasuk pajak.</p><p>{quote.details.validDays ? `Berlaku ${quote.details.validDays} hari sejak tanggal penawaran.` : 'Masa berlaku belum ditentukan.'}</p>{quote.details.notes && <p className="preserve-lines">{quote.details.notes}</p>}</div>
      <p className="quote-paper-footer">Terima kasih atas kepercayaan Anda.</p>
    </div><div className="preview-actions"><button className="button button-secondary" onClick={onCopy}><MessageCircle size={17} /> Salin WhatsApp</button><button className="button button-primary" onClick={onPdf} disabled={busy}><Download size={17} /> {busy ? 'Membuat PDF…' : 'Unduh PDF'}</button></div></>}
  </Dialog.Content></Dialog.Portal></Dialog.Root>
}
