import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/cloud/authContext'
import { translateAuthError } from '../lib/cloud/authErrors'

/**
 * Target of the Supabase recovery redirect. The session arrives in the URL hash
 * and is picked up by the client's `detectSessionInUrl`, so no token is read or
 * stored here.
 */
export function ResetPasswordPage() {
  const { client, cloudUnavailable } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  if (cloudUnavailable) {
    return (
      <div className="container legal-page">
        <h1>Atur ulang kata sandi</h1>
        <p>Fitur akun belum aktif di penerapan ini.</p>
        <Link to="/" className="button button-primary">Kembali ke kalkulator</Link>
      </div>
    )
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (!client) throw new Error('Cloud belum dikonfigurasi.')
      const { error: updateError } = await client.auth.updateUser({ password })
      if (updateError) throw new Error(translateAuthError(updateError.message))
      setDone(true)
      setTimeout(() => navigate('/', { replace: true }), 1500)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gagal menyimpan kata sandi baru.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="container legal-page">
      <span className="eyebrow">Akun</span>
      <h1>Atur ulang kata sandi</h1>
      {done ? (
        <p role="status">Kata sandi diperbarui. Mengalihkan ke kalkulator…</p>
      ) : (
        <form onSubmit={(event) => { void submit(event) }} className="auth-form" style={{ maxWidth: '22rem' }}>
          <label className="auth-field"><span>Kata sandi baru</span>
            <input type="password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" />
          </label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan kata sandi'}</button>
        </form>
      )}
      <p><Link to="/">Kembali ke kalkulator</Link></p>
    </div>
  )
}
