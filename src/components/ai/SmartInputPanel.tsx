import { useState } from 'react'
import { useFormContext, useWatch } from 'react-hook-form'
import { AlertTriangle, Loader2, Sparkles, Wand2 } from 'lucide-react'
import type { QuoteFormValues } from '../../features/quotation/defaults'
import { useAuth } from '../../lib/cloud/authContext'
import { MAX_INPUT_CHARS, type AiParseResult, type AiMode } from '../../lib/ai/schema'
import { applyProposals, buildProposals, toggleProposal, type Proposal } from '../../lib/ai/diff'
import { newIdempotencyKey, requestAiParse } from '../../lib/ai/client'
import { AuthDialog } from '../cloud/AuthDialog'
import './smart-input.css'

const EXAMPLE = 'Hampers 25 pcs, bahan kain 60rb per pcs, tambahan kemasan 8rb, biaya jahit 15rb, margin 30%, kirim 12 hari.'

type Props = {
  /** Called after values are written so the draft starts saving. */
  onApplied: () => void
}

export function SmartInputPanel({ onApplied }: Props) {
  const form = useFormContext<QuoteFormValues>()
  const values = useWatch({ control: form.control }) as QuoteFormValues
  const { status, client } = useAuth()
  const [text, setText] = useState('')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [result, setResult] = useState<AiParseResult | null>(null)
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [notice, setNotice] = useState('')
  const [failure, setFailure] = useState('')

  const signedIn = status === 'signed-in'
  const ready = text.trim().length > 3 && consent && !busy

  const run = async () => {
    if (!ready) return
    setFailure('')
    setNotice('')
    if (!signedIn || !client) {
      setAuthOpen(true)
      return
    }
    const { data } = await client.auth.getSession()
    const token = data.session?.access_token
    if (!token) {
      setAuthOpen(true)
      return
    }
    setBusy(true)
    try {
      const outcome = await requestAiParse({ text, token, idempotencyKey: newIdempotencyKey() })
      if (!outcome.ok) {
        setFailure(outcome.error.message)
        return
      }
      const parsed = outcome.data
      setResult(parsed)
      setProposals(buildProposals(values, parsed.fields, (parsed.mode ?? values.mode) as AiMode).proposals)
      if (parsed.mock) setNotice('Contoh AI belum aktif. Tidak ada angka yang diisi otomatis.')
      else if (!Object.keys(parsed.fields).length) setNotice('Tidak ada angka biaya yang disebut. Lengkapi manual.')
    } finally {
      setBusy(false)
    }
  }

  const apply = () => {
    const next = applyProposals(values, proposals)
    for (const proposal of proposals) {
      if (proposal.selected) form.setValue(proposal.field, next[proposal.field], { shouldDirty: true, shouldValidate: true })
    }
    onApplied()
    const count = proposals.filter((proposal) => proposal.selected).length
    setNotice(`${count} isian diterapkan. Periksa angkanya sebelum membuat penawaran.`)
    setResult(null)
    setProposals([])
  }

  const ignored = result ? buildProposals(values, result.fields, (result.mode ?? values.mode) as AiMode).ignored : []

  return (
    <section className="smart-input" aria-labelledby="smart-input-title">
      <div className="smart-head">
        <span className="smart-title" id="smart-input-title"><Sparkles size={14} /> Smart Input</span>
        <span className="smart-badge">{result?.remaining !== null && result?.remaining !== undefined ? `Sisa ${result.remaining} bulan ini` : '2x / bulan · gratis'}</span>
      </div>
      <p className="smart-lede">Tulis catatan singkat. AI mengubahnya jadi angka — biaya yang tidak Anda sebut dibiarkan kosong, tidak ditebak.</p>

      <label className="smart-label" htmlFor="smart-text">Catatan pesanan</label>
      <textarea id="smart-text" rows={3} maxLength={MAX_INPUT_CHARS} value={text} placeholder={EXAMPLE} onChange={(event) => { setText(event.target.value); setFailure(''); setNotice('') }} aria-describedby="smart-help" />
      <div className="smart-meta">
        <span id="smart-help">Nama, email, telepon, dan nomor rekening dihapus otomatis sebelum dikirim.</span>
        <span>{text.length}/{MAX_INPUT_CHARS}</span>
      </div>

      <label className="smart-consent">
        <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
        <span>Kirim catatan ini ke layanan AI untuk diubah jadi angka.</span>
      </label>

      <div className="smart-actions">
        <button type="button" className="button button-secondary" disabled={!ready} onClick={() => { void run() }}>
          {busy ? <Loader2 size={15} className="spin" /> : <Wand2 size={15} />} {busy ? 'Membaca catatan' : signedIn ? 'Isi otomatis' : 'Masuk & isi otomatis'}
        </button>
        {text && <button type="button" className="text-button" onClick={() => { setText(''); setResult(null); setProposals([]); setNotice(''); setFailure('') }}>Bersihkan</button>}
      </div>

      {failure && <p className="smart-failure" role="alert">{failure}</p>}
      {notice && <p className="smart-notice" role="status">{notice}</p>}

      {result && result.mock && <p className="smart-warning"><AlertTriangle size={14} /> Contoh AI (belum aktif). Tidak ada isian yang bisa diterapkan.</p>}

      {proposals.length > 0 && (
        <div className="smart-diff">
          <table>
            <caption>Periksa sebelum diterapkan. Kolom centang menentukan isian yang ditimpa.</caption>
            <thead><tr><th scope="col">Isi</th><th scope="col">Sekarang</th><th scope="col">Dari catatan</th></tr></thead>
            <tbody>
              {proposals.map((proposal) => (
                <tr key={proposal.field}>
                  <td><label><input type="checkbox" checked={proposal.selected} onChange={() => setProposals((current) => current.map((item) => (item.field === proposal.field ? toggleProposal(item) : item)))} /> {proposal.label}</label></td>
                  <td className={proposal.current.trim() ? '' : 'smart-empty'}>{proposal.current.trim() || 'kosong'}</td>
                  <td><strong>{proposal.proposed}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="smart-apply">
            <button type="button" className="button button-primary" onClick={apply} disabled={!proposals.some((proposal) => proposal.selected)}>Terapkan {proposals.filter((proposal) => proposal.selected).length} isian</button>
            <button type="button" className="text-button" onClick={() => { setResult(null); setProposals([]) }}>Batal</button>
          </div>
        </div>
      )}

      {result && !result.mock && ignored.length > 0 && <p className="smart-note">Tidak dipakai karena mode {values.mode}: {ignored.join(', ')}.</p>}
      {result && result.assumptions.length > 0 && <ul className="smart-list">{result.assumptions.map((item) => <li key={item}>{item}</li>)}</ul>}
      {result && result.missing.length > 0 && <p className="smart-note">Belum disebut: {result.missing.join(', ')}.</p>}
      {result && result.deadline && <p className="smart-note">Tenggat disebut: {result.deadline}. Isi sendiri di catatan bila perlu.</p>}
      {result && result.redactedCount > 0 && <p className="smart-note">{result.redactedCount} data pribadi dihapus sebelum dikirim.</p>}

      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} reason="Smart Input memakai kuota akun Anda." />
    </section>
  )
}

