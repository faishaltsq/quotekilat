import { useContext, useState } from 'react'
import { ArrowRight, Loader2, RefreshCw } from 'lucide-react'
import { AuthContext } from '../../lib/cloud/authContext'
import { useBilling } from '../../lib/billing/useBilling'
import { startCheckout, settlePayment, type QrisSession } from '../../lib/billing/client'
import { track } from '../../lib/analytics/track'
import './billing.css'

const rupiah = (value: number): string => `Rp${value.toLocaleString('id-ID')}`

/**
 * Sandbox only. This component never renders a price it did not receive from the
 * server and never grants anything: it shows the QRIS code the gateway issued,
 * and the plan changes only when the webhook lands.
 */
export function UpgradePanel() {
  // Context read directly: the pricing page mounts this outside an AuthProvider,
  // where useAuth() would throw instead of rendering the guest hint.
  const auth = useContext(AuthContext)
  const authStatus = auth?.status
  const client = auth?.client ?? null
  const { status: billing, loading, reload } = useBilling()
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const [session, setSession] = useState<QrisSession | null>(null)
  const [orderId, setOrderId] = useState<string | null>(null)

  const signedIn = authStatus === 'signed-in'
  const plan = billing?.plan ?? 'free'

  const upgrade = async () => {
    if (!client) return
    setError('')
    setBusy(true)
    try {
      const { data } = await client.auth.getSession()
      const token = data.session?.access_token
      if (!token) {
        setError('Masuk dulu untuk berlangganan.')
        return
      }
      const result = await startCheckout({ token, plan: 'pro' })
      if (!result.ok) {
        setError(result.message)
        return
      }
      track('checkout_started', { plan: 'pro' })
      setOrderId(result.orderId)
      setSession(result.qris)
    } finally {
      setBusy(false)
    }
  }

  // The buyer only asks the server to check; the server asks the gateway. This
  // panel never flips the plan itself, and a gateway that still says PENDING
  // leaves the page exactly where it was.
  const checkAgain = async () => {
    if (!client || !orderId) return
    setError('')
    setChecking(true)
    try {
      const { data } = await client.auth.getSession()
      const token = data.session?.access_token
      if (!token) {
        setError('Sesi berakhir. Masuk lagi.')
        return
      }
      const result = await settlePayment({ token, orderId })
      if (!result.ok) {
        setError(result.message)
        return
      }
      if (result.plan === 'pro') {
        await reload()
        return
      }
      if (result.status === 'EXPIRED') {
        setError('Kode QRIS sudah kedaluwarsa. Buat pesanan baru.')
        return
      }
      setError('Pembayaran belum terdeteksi. Tunggu sebentar lalu periksa lagi.')
    } finally {
      setChecking(false)
    }
  }

  if (!signedIn) {
    return (
      <p className="billing-note">
        Masuk lewat panel <strong>Simpan ke cloud</strong> di kalkulator untuk melihat status langganan.
      </p>
    )
  }

  if (loading) return <p className="billing-note">Memuat status langganan…</p>

  if (plan === 'pro') {
    return (
      <p className="billing-status" role="status">
        Paket Pro aktif{billing?.currentPeriodEnd
          ? ` sampai ${new Date(billing.currentPeriodEnd).toLocaleDateString('id-ID')}`
          : ''}.
        {' '}Kuota bulan ini: {billing?.remaining.aiParse ?? 0} dari {billing?.limits.aiParse ?? 0} parse AI,
        {' '}{billing?.remaining.quotes ?? 0} dari {billing?.limits.quotes ?? 0} penawaran cloud.
      </p>
    )
  }

  if (session) {
    return (
      <div className="billing-upgrade">
        <p className="billing-note">
          Pindai QRIS ini dengan aplikasi bank atau e-wallet. Nominal harus tepat{' '}
          <strong>{rupiah(session.totalIdr)}</strong>
          {session.uniqueCode > 0 ? ` (termasuk kode unik ${session.uniqueCode})` : ''}.
        </p>
        {session.imageUrl
          ? <img className="billing-qr" src={session.imageUrl} alt="Kode QRIS pembayaran" width={240} height={240} />
          : <p className="billing-error" role="alert">Kode QR tidak tersedia. Coba buat ulang.</p>}
        {session.expiredAt && (
          <p className="billing-note">
            Berlaku sampai {new Date(session.expiredAt).toLocaleTimeString('id-ID')}.
          </p>
        )}
        <button type="button" className="button button-secondary" onClick={() => { void checkAgain() }} disabled={checking}>
          {checking ? <><Loader2 size={16} className="spin" /> Memeriksa…</> : <><RefreshCw size={16} aria-hidden="true" /> Saya sudah bayar</>}
        </button>
        <p className="billing-note">
          Paket aktif setelah pembayaran terverifikasi ke penyedia pembayaran. Halaman ini tidak pernah mengaktifkan Pro sendiri.
        </p>
        {error && <p className="billing-error" role="alert">{error}</p>}
      </div>
    )
  }

  return (
    <div className="billing-upgrade">
      <p className="billing-note">
        Pembayaran QRIS berjalan di <strong>mode sandbox KlikQRIS</strong>. Tidak ada uang yang ditarik.
      </p>
      <button type="button" className="button button-primary" onClick={() => { void upgrade() }} disabled={busy}>
        {busy ? <><Loader2 size={16} className="spin" /> Membuat kode QRIS…</> : <>Coba Pro (sandbox) <ArrowRight size={16} aria-hidden="true" /></>}
      </button>
      {error && <p className="billing-error" role="alert">{error}</p>}
    </div>
  )
}
