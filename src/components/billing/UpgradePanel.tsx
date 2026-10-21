import { useContext, useState } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'
import { AuthContext } from '../../lib/cloud/authContext'
import { useBilling } from '../../lib/billing/useBilling'
import { startCheckout } from '../../lib/billing/client'
import './billing.css'

/**
 * Sandbox only: this component never renders a price it did not receive from the
 * server, and it never grants anything. It navigates to the provider's page and
 * the webhook does the rest.
 */
export function UpgradePanel() {
  // Context read directly: the pricing page mounts this outside an AuthProvider,
  // where useAuth() would throw instead of rendering the guest hint.
  const auth = useContext(AuthContext)
  const authStatus = auth?.status
  const client = auth?.client ?? null
  const { status: billing, loading } = useBilling()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

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
      window.location.assign(result.redirectUrl)
    } finally {
      setBusy(false)
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

  return (
    <div className="billing-upgrade">
      <p className="billing-note">
        Pembayaran berjalan di <strong>mode sandbox Midtrans</strong>. Tidak ada uang yang ditarik.
      </p>
      <button type="button" className="button button-primary" onClick={() => { void upgrade() }} disabled={busy}>
        {busy ? <><Loader2 size={16} className="spin" /> Membuka pembayaran…</> : <>Coba Pro (sandbox) <ArrowRight size={16} aria-hidden="true" /></>}
      </button>
      {error && <p className="billing-error" role="alert">{error}</p>}
    </div>
  )
}
