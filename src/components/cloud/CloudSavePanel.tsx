import { useState } from 'react'
import { Check, Cloud, Loader2, LogOut, Trash2 } from 'lucide-react'
import { useAuth } from '../../lib/cloud/authContext'
import { useCloudQuotes } from '../../lib/cloud/useCloudQuotes'
import { CloudError } from '../../lib/cloud/quotesApi'
import { formatIDR } from '../../lib/pricing/format'
import { newIdempotencyKey } from '../../lib/cloud/useCloudQuotes'
import type { SaveQuoteSource } from '../../lib/cloud/quoteMapping'
import { useBilling } from '../../lib/billing/useBilling'
import { AuthDialog } from './AuthDialog'
import './cloud.css'

type Props = {
  /** Null while the quote is not yet calculable. */
  source: SaveQuoteSource | null
  disabledReason?: string
}

export function CloudSavePanel({ source, disabledReason }: Props) {
  const { status, user, cloudUnavailable, signOut } = useAuth()
  const { quotes, remaining, loading, error, save, setStatus } = useCloudQuotes()
  const { status: billing } = useBilling()
  const quoteLimit = billing?.limits.quotes ?? 5
  const [authOpen, setAuthOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState(false)
  const [pendingKey, setPendingKey] = useState<string | null>(null)

  if (cloudUnavailable) return null

  const signedIn = status === 'signed-in'

  const onSave = async () => {
    if (!source) return
    setFailure('')
    setNotice('')
    if (!signedIn) {
      // Reuse the same key after auth so the retry cannot duplicate the row.
      setPendingKey(newIdempotencyKey())
      setAuthOpen(true)
      return
    }
    const key = pendingKey ?? newIdempotencyKey()
    setBusy(true)
    try {
      await save(source, key)
      setPendingKey(null)
      setNotice('Penawaran tersimpan di cloud.')
    } catch (cause) {
      if (cause instanceof CloudError && cause.code === 'QUOTA_EXCEEDED') {
        setFailure(`Kuota ${quoteLimit} penawaran bulan ini sudah habis. Data tetap aman di perangkat ini.`)
      } else if (cause instanceof CloudError && cause.code === 'AUTH_REQUIRED') {
        setAuthOpen(true)
      } else {
        setFailure(cause instanceof Error ? cause.message : 'Gagal menyimpan ke cloud.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="cloud-panel" aria-labelledby="cloud-heading">
      <div className="cloud-head">
        <h2 id="cloud-heading"><Cloud size={17} /> Simpan ke cloud</h2>
        {signedIn ? (
          <div className="cloud-account">
            <span>{user?.email}</span>
            <button type="button" className="link-button" onClick={() => { void signOut() }}><LogOut size={14} /> Keluar</button>
          </div>
        ) : (
          <span className="cloud-guest">Belum masuk</span>
        )}
      </div>

      <p className="cloud-copy">
        {signedIn
          ? `Sisa kuota bulan ini: ${remaining === null ? '—' : `${remaining} dari ${quoteLimit}`} penawaran.`
          : 'Opsional. Tanpa akun, penawaran tetap tersimpan di perangkat ini saja.'}
      </p>

      <div className="cloud-actions">
        <button type="button" className="button button-secondary" onClick={() => { void onSave() }} disabled={!source || busy} title={disabledReason}>
          {busy ? <><Loader2 size={16} className="spin" /> Menyimpan…</> : <><Cloud size={16} /> {signedIn ? 'Simpan ke cloud' : 'Masuk & simpan'}</>}
        </button>
        {signedIn && <button type="button" className="link-button" onClick={() => { void signOut() }}>Ganti akun</button>}
      </div>

      {notice && <p className="cloud-notice" role="status"><Check size={14} /> {notice}</p>}
      {failure && <p className="cloud-error" role="alert">{failure}</p>}
      {error && <p className="cloud-error" role="alert">{error}</p>}

      {signedIn && (
        <div className="cloud-history">
          <h3>Riwayat cloud</h3>
          {loading && <p className="cloud-muted">Memuat…</p>}
          {!loading && quotes.length === 0 && <p className="cloud-muted">Belum ada penawaran tersimpan.</p>}
          {quotes.length > 0 && (
            <ul>
              {quotes.map((quote) => (
                <li key={quote.id}>
                  <div>
                    <strong>{quote.title}</strong>
                    <span className="cloud-meta">{formatIDR(quote.computed_price_idr)} · {quote.status}</span>
                  </div>
                  <div className="cloud-row-actions">
                    {quote.status === 'draft' && (
                      <button type="button" className="link-button" onClick={() => { void setStatus(quote.id, 'sent') }}>Tandai terkirim</button>
                    )}
                    <span className="cloud-meta">{new Date(quote.created_at).toLocaleDateString('id-ID')}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="cloud-muted"><Trash2 size={12} /> Hapus permanen belum tersedia di fase ini.</p>
        </div>
      )}

      <AuthDialog
        open={authOpen}
        onOpenChange={(next) => { setAuthOpen(next); if (!next) setPendingKey(null) }}
        reason="Masuk hanya diperlukan untuk menyimpan ke cloud. Kalkulator tetap bisa dipakai tanpa akun."
      />
    </section>
  )
}
