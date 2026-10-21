import { useEffect, useMemo, useRef, useState } from 'react'
import { FormProvider, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as Dialog from '@radix-ui/react-dialog'
import { Check, HardDrive, Package, RotateCcw, Scissors, ShieldCheck, Sparkles, Wrench, X } from 'lucide-react'
import { DEFAULT_VALUES, blankValues, type QuoteFormValues } from '../../features/quotation/defaults'
import { formSchema, validateQuoteForm } from '../../lib/validation/quoteForm'
import { calculatePricing } from '../../lib/pricing/pricingEngine'
import { createQuote, formatWhatsApp, randomQuoteSuffix, type QuoteSnapshot } from '../../lib/quotation/quote'
import { clearDraft, loadDraft, saveDraft } from '../../lib/storage/guestDraft'
import { clearTabDraft, loadTabDraft, saveTabDraft } from '../../lib/storage/tabDraft'
import { AdvancedFields, CustomerFields, ModeFields } from './QuoteFields'
import { PricingSummary } from './PricingSummary'
import { LiveInvoicePreview } from './LiveInvoicePreview'
import { CloudSavePanel } from '../cloud/CloudSavePanel'
import { SmartInputPanel } from '../ai/SmartInputPanel'
import { smartInputEnabled } from '../../lib/ai/flag'
import type { SaveQuoteSource } from '../../lib/cloud/quoteMapping'
import './quote-builder.css'

const modes = [
  { value: 'goods', label: 'Barang', icon: Package },
  { value: 'service', label: 'Jasa', icon: Wrench },
  { value: 'custom', label: 'Custom', icon: Scissors },
] as const

export function QuoteBuilder() {
  const [initial] = useState(() => loadTabDraft() ?? loadDraft())
  const form = useForm<QuoteFormValues>({
    defaultValues: initial?.values ?? DEFAULT_VALUES,
    resolver: zodResolver(formSchema),
    shouldUnregister: false,
    mode: 'onChange',
  })
  const values = useWatch({ control: form.control }) as QuoteFormValues
  const [sample, setSample] = useState(!initial)
  const [storageStatus, setStorageStatus] = useState(initial ? 'Draft dipulihkan dari perangkat ini' : 'Contoh data — bisa diubah')
  const [notice, setNotice] = useState('')
  const [fallback, setFallback] = useState('')
  const [busy, setBusy] = useState(false)
  const savingAllowed = useRef(false)
  const fallbackRef = useRef<HTMLTextAreaElement>(null)
  // One date + one suffix per mount: the invoice number must not change while typing.
  const [quoteAnchor] = useState(() => new Date())
  const [quoteSuffix] = useState(() => randomQuoteSuffix())

  const calculation = useMemo(() => {
    const parsed = validateQuoteForm(values)
    if (!parsed.input) return { ...parsed, result: null, error: undefined }
    try {
      return { ...parsed, result: calculatePricing(parsed.input), error: undefined }
    } catch (error) {
      return { ...parsed, result: null, error: error instanceof Error ? error.message : 'Perhitungan belum tersedia.' }
    }
  }, [values])

  const quantity = values.mode === 'service' ? 1 : Number(values.mode === 'custom' ? values.customQuantity : values.quantity)

  const liveQuote = useMemo<QuoteSnapshot | null>(() => {
    if (!calculation.result) return null
    const title = (values.mode === 'goods' ? values.goodsTitle : values.mode === 'service' ? values.serviceTitle : values.customTitle).trim()
    const validDays = /^\d{1,3}$/.test(values.validDays.trim()) ? Math.min(Number(values.validDays), 365) : 0
    try {
      return createQuote(
        {
          title,
          businessName: values.businessName.trim(),
          customerName: values.customerName.trim(),
          notes: values.notes.trim(),
          validDays,
        },
        values.mode,
        quantity,
        calculation.result,
        quoteAnchor,
        quoteSuffix,
      )
    } catch {
      return null
    }
  }, [calculation.result, quantity, quoteAnchor, quoteSuffix, values])

  useEffect(() => {
    saveTabDraft(values)
    if (!savingAllowed.current) return
    const stored = saveDraft(values)
    setStorageStatus(stored ? 'Tersimpan di perangkat ini' : 'Penyimpanan tidak tersedia. Draft hanya di tab ini.')
  }, [values])

  const markEdited = () => {
    savingAllowed.current = true
    setSample(false)
    setNotice('')
  }

  const copy = async (quote: QuoteSnapshot | null) => {
    if (!quote) return
    const message = formatWhatsApp(quote)
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(message)
      setNotice('Teks penawaran berhasil disalin. Tempel ke WhatsApp untuk mengirim.')
    } catch {
      setFallback(message)
      setNotice('Clipboard tidak tersedia. Salin teks secara manual.')
    }
  }

  const pdf = async (quote: QuoteSnapshot | null) => {
    if (!quote || busy) return
    setBusy(true)
    try {
      const { downloadQuotePdf } = await import('../../lib/pdf/generatePdf')
      await downloadQuotePdf(quote)
      setNotice('PDF berhasil dibuat di perangkat Anda.')
    } catch (error) {
      setNotice(`PDF belum dapat dibuat: ${error instanceof Error ? error.message : 'silakan coba lagi.'}`)
    } finally {
      setBusy(false)
    }
  }

  const clear = () => {
    if (!window.confirm('Hapus draft QuoteKilat dari perangkat ini dan kosongkan formulir?')) return
    savingAllowed.current = false
    const removed = clearDraft()
    clearTabDraft()
    form.reset(blankValues())
    setSample(false)
    setStorageStatus(removed ? 'Data perangkat dihapus. Draft baru disimpan setelah Anda mengedit.' : 'Penyimpanan diblokir; hapus data situs lewat pengaturan browser.')
    setNotice(removed ? 'Draft lokal dan detail di formulir telah dihapus.' : 'Formulir dikosongkan, tetapi penghapusan penyimpanan diblokir browser.')
  }

  const errors = calculation.errors
  const cloudSource: SaveQuoteSource | null = calculation.result
    ? {
        details: {
          title: (values.mode === 'goods' ? values.goodsTitle : values.mode === 'service' ? values.serviceTitle : values.customTitle).trim(),
          customerName: values.customerName.trim(),
        },
        mode: values.mode,
        quantity,
        targetMarginBps: Math.round((Number(values.marginPercent.replace(',', '.')) || 0) * 100),
        pricing: calculation.result,
      }
    : null

  return (
    <section className="quote-builder" id="quote-builder" aria-labelledby="builder-title" tabIndex={-1}>
      <div className="builder-panel">
        <div className="builder-topline">
          <div>
            <span className="eyebrow">Ruang hitung Anda</span>
            <h2 id="builder-title">Mulai dari angka yang tepat.</h2>
          </div>
          <span className="local-badge">
            <ShieldCheck size={13} /> Privat &amp; lokal
          </span>
        </div>

        <FormProvider {...form}>
          <form noValidate onSubmit={(event) => event.preventDefault()} onChangeCapture={markEdited}>
            <div role="tablist" aria-label="Jenis penawaran" className="quote-tabs">
              {modes.map(({ value, label, icon: Icon }, index) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={values.mode === value}
                  aria-controls="mode-fields"
                  id={`tab-${value}`}
                  tabIndex={values.mode === value ? 0 : -1}
                  onClick={() => {
                    markEdited()
                    form.setValue('mode', value)
                  }}
                  onKeyDown={(event) => {
                    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
                    event.preventDefault()
                    const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + (event.key === 'ArrowRight' ? 1 : -1) + 3) % 3
                    markEdited()
                    form.setValue('mode', modes[next].value)
                    document.getElementById(`tab-${modes[next].value}`)?.focus()
                  }}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </div>

            <div className="builder-body">
              <div className="builder-inputs">
                <div className="sample-row">
                  <span>{sample ? 'Contoh data — bisa diubah' : 'Sesuaikan dengan biaya usaha Anda'}</span>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      markEdited()
                      form.reset({ ...DEFAULT_VALUES, mode: values.mode })
                      setSample(true)
                    }}
                  >
                    <RotateCcw size={12} /> Isi contoh
                  </button>
                </div>

                <div role="tabpanel" id="mode-fields" aria-labelledby={`tab-${values.mode}`}>
                  <ModeFields values={values} errors={errors} />
                </div>

                <div className="margin-control">
                  <div className="margin-heading">
                    <label htmlFor="margin-slider">Target gross margin</label>
                    <div className="margin-value">
                      <input
                        aria-label="Target margin (%)"
                        type="text"
                        inputMode="decimal"
                        {...form.register('marginPercent')}
                        maxLength={5}
                        aria-invalid={!!errors.marginPercent}
                        aria-describedby="margin-help"
                      />
                      <span>%</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    id="margin-slider"
                    min="0"
                    max="80"
                    step="1"
                    value={Number(values.marginPercent.replace(',', '.')) || 0}
                    onChange={(event) => {
                      markEdited()
                      form.setValue('marginPercent', event.target.value)
                    }}
                    aria-valuetext={`${values.marginPercent}% gross margin`}
                  />
                  <div className="range-labels">
                    <span>0%</span>
                    <span>80%</span>
                  </div>
                  <p className={errors.marginPercent ? 'field-error' : 'field-hint'} id="margin-help">
                    {errors.marginPercent || 'Bagian laba dari harga jual, bukan markup dari biaya.'}
                  </p>
                </div>

                <AdvancedFields values={values} errors={errors} />
                <CustomerFields errors={errors} />
              </div>

              <div className="builder-result">
                <PricingSummary result={calculation.result} error={calculation.error} quantity={quantity} />
                <div className="builder-reassurance">
                  <Check size={12} /> Tanpa login <span>·</span> Gratis digunakan <span>·</span> Tanpa kirim data
                </div>
              </div>
            </div>

            <div className="draft-controls">
              <span role="status">
                <HardDrive size={13} />
                {storageStatus}
              </span>
              <button className="text-button" onClick={clear}>
                Hapus data perangkat
              </button>
            </div>

            <details className="builder-extras">
              <summary>
                Simpan, draft &amp; AI <span>Opsional</span>
              </summary>
              <div className="builder-extras-body">
                <details className="storage-privacy">
                  <summary>Tentang privasi draft</summary>
                  <p>
                    Angka biaya, nama item, dan pengaturan disimpan di browser ini setelah Anda mengedit. Nama usaha,
                    pelanggan, dan catatan hanya disimpan jika Anda memilihnya. Tidak ada pengiriman data ke server.
                    Draft hilang saat data browser dihapus. <a href="/privacy">Kebijakan privasi (draf)</a>.
                  </p>
                </details>
                <CloudSavePanel source={cloudSource} disabledReason="Lengkapi input agar penawaran bisa dihitung." />
                {smartInputEnabled ? (
                  <SmartInputPanel onApplied={markEdited} />
                ) : (
                  <div className="inline-ai">
                    <Sparkles size={15} />
                    <span>Smart Input</span>
                    <span className="soon-label">Segera hadir · belum aktif</span>
                  </div>
                )}
              </div>
            </details>

            {notice && (
              <p className="action-notice" role="status">
                {notice}
              </p>
            )}
          </form>
        </FormProvider>
      </div>

      <LiveInvoicePreview
        quote={liveQuote}
        busy={busy}
        onCopy={() => {
          void copy(liveQuote)
        }}
        onPdf={() => {
          void pdf(liveQuote)
        }}
      />

      <Dialog.Root
        open={!!fallback}
        onOpenChange={(open) => {
          if (!open) setFallback('')
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content
            className="manual-dialog"
            onOpenAutoFocus={(event) => {
              event.preventDefault()
              fallbackRef.current?.focus()
              fallbackRef.current?.select()
            }}
          >
            <Dialog.Title>Salin penawaran secara manual</Dialog.Title>
            <Dialog.Description>
              Pilih teks, lalu salin dengan Ctrl+C atau menu salin perangkat Anda.
            </Dialog.Description>
            <textarea ref={fallbackRef} value={fallback} readOnly aria-label="Teks penawaran WhatsApp" rows={13} />
            <Dialog.Close className="button button-secondary">Selesai</Dialog.Close>
            <Dialog.Close className="icon-button dialog-close" aria-label="Tutup salin manual">
              <X size={20} />
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  )
}
