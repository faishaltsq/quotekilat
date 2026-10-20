import * as Dialog from '@radix-ui/react-dialog'
import { useState, type FormEvent } from 'react'
import { Loader2, X } from 'lucide-react'
import { useAuth } from '../../lib/cloud/authContext'

type Mode = 'signin' | 'signup' | 'reset'

/**
 * Auth is requested only for a cloud-dependent action. The guest builder stays
 * fully usable, and this dialog is never opened on page load.
 */
export function AuthDialog({ open, onOpenChange, reason }: { open: boolean; onOpenChange: (open: boolean) => void; reason: string }) {
  const { signInWithPassword, signUpWithPassword, requestPasswordReset } = useAuth()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const reset = () => { setError(''); setNotice('') }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    reset()
    setBusy(true)
    try {
      if (mode === 'reset') {
        await requestPasswordReset(email.trim())
        setNotice('Kalau email terdaftar, tautan atur ulang sudah dikirim.')
        return
      }
      if (mode === 'signup') {
        const { needsConfirmation } = await signUpWithPassword(email.trim(), password, displayName.trim())
        if (needsConfirmation) {
          setNotice('Cek email untuk konfirmasi, lalu masuk di sini.')
          setMode('signin')
        } else {
          onOpenChange(false)
        }
        return
      }
      await signInWithPassword(email.trim(), password)
      onOpenChange(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gagal memproses permintaan.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="auth-dialog" aria-describedby="auth-reason">
          <div className="auth-head">
            <Dialog.Title>{mode === 'signup' ? 'Buat akun gratis' : mode === 'reset' ? 'Atur ulang kata sandi' : 'Masuk'}</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label="Tutup"><X size={18} /></Dialog.Close>
          </div>
          <p id="auth-reason" className="auth-reason">{reason}</p>
          <form onSubmit={(event) => { void submit(event) }} className="auth-form">
            {mode === 'signup' && (
              <label className="auth-field"><span>Nama tampilan</span>
                <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={80} autoComplete="name" />
              </label>
            )}
            <label className="auth-field"><span>Email</span>
              <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" inputMode="email" />
            </label>
            {mode !== 'reset' && (
              <label className="auth-field"><span>Kata sandi</span>
                <input type="password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
              </label>
            )}
            {error && <p className="auth-error" role="alert">{error}</p>}
            {notice && <p className="auth-notice" role="status">{notice}</p>}
            <button type="submit" className="button button-primary" disabled={busy}>
              {busy ? <><Loader2 size={16} className="spin" /> Memproses…</> : mode === 'signup' ? 'Buat akun' : mode === 'reset' ? 'Kirim tautan' : 'Masuk'}
            </button>
          </form>
          <div className="auth-switch">
            {mode !== 'signup' && <button type="button" className="link-button" onClick={() => { setMode('signup'); reset() }}>Belum punya akun?</button>}
            {mode !== 'signin' && <button type="button" className="link-button" onClick={() => { setMode('signin'); reset() }}>Sudah punya akun?</button>}
            {mode !== 'reset' && <button type="button" className="link-button" onClick={() => { setMode('reset'); reset() }}>Lupa kata sandi</button>}
          </div>
          <p className="auth-fineprint">Data penawaran Anda tetap di perangkat sampai Anda memilih menyimpannya ke cloud.</p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
