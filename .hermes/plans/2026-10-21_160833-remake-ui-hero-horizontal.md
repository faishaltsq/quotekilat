# QuoteKilat — Remake UI: horizontal "ruang hitung" hero + realtime invoice preview

## Goal

Turn the landing page into a single horizontal app shell — copy rail | calculator | live invoice preview — with the marketing copy, Pro upgrade and explanations moved below the fold, a much more visible parallax background, and the "Buat Penawaran" dialog removed in favour of an always-on realtime preview.

---

## 1. Current context / assumptions

### Repo facts you must not re-derive

- Vite + React 19 + TypeScript 6, Tailwind v4 is installed **but the app is styled with plain CSS files**, not utility classes. Do not introduce Tailwind utilities; follow the existing plain-CSS convention.
- Package manager: **pnpm 12.3.4**. Never run bare `npm install` in this repo (the shell exports `NODE_ENV=production`, which makes npm prune every devDependency and silently breaks `vitest`/`tsc`).
- Routes (`src/app/App.tsx`): `/` (landing), `/pricing`, `/privacy`, `/terms`, `/reset-password`, `*` (404).
- Landing composition today: `Home()` in `src/app/App.tsx` renders `<section className="hero">` → `HeroParallaxLayers` + `<div className="container hero-layout"><HeroCopy /><QuoteBuilder /></div>`, then `<MarketingSections />`.
- `MarketingSections.tsx` already contains everything that must now live **below the fold**: benefit strip (`#fitur`), cara kerja (`#cara-kerja`), Market Insights, pricing incl. Pro (`#harga`), FAQ (`#faq`).
- `QuoteBuilder.tsx` is one 130-line component: react-hook-form + zod, mode tabs (Barang/Jasa/Custom), margin slider, advanced/customer `<details>`, `PricingSummary`, a "Buat Penawaran" submit button that opens a Radix dialog (`QuotePreview.tsx`), plus `CloudSavePanel` and `SmartInputPanel`.
- Business logic must not change: `src/lib/pricing/*`, `src/lib/validation/quoteForm.ts`, `src/lib/pdf/*`, `src/lib/storage/*`, `src/lib/cloud/*`, `src/lib/ai/*`, `src/features/quotation/defaults.ts`.
- `createQuote()` in `src/lib/quotation/quote.ts` currently generates a **random** 12-hex suffix on every call, and `QuoteBuilder` only calls it on submit. A realtime preview needs a stable id.
- Parallax lives in `src/components/landing/HeroParallaxLayers.tsx` (3 SVG invoice sheets, `--qk-parallax` 0→24px) and its CSS in `src/components/landing/landing.css` (`.qk-hero-layers`, `.qk-invoice-sheet-1..3`, opacity 0.10–0.14, blur 0.4px). It is hidden ≤768px and disabled under `prefers-reduced-motion`.
- Hero layout CSS is **duplicated**: `.hero`, `.hero-layout`, `.hero-copy` in `src/styles/global.css` (lines 35–37, plus media rules at 55–58) *and* the `.qk-hero-*` block in `src/components/landing/landing.css` (lines 1–145). The refactor consolidates all hero layout into `landing.css` and deletes the dead `global.css` rules.
- Baseline is green: **378 tests / 26 files**, plus `typecheck`, `lint`, `build`, and 24 Playwright E2E tests (desktop + mobile emulation, `npm run preview` on 127.0.0.1:4173).

### Decisions already taken with the user (do not re-litigate)

1. **Scope: the whole app** — landing, builder, preview, `/pricing`, `/privacy`, `/terms`.
2. **Realtime preview = third column of the hero**, always visible. The "Buat Penawaran" button and the `QuotePreview` dialog are **deleted**; the Salin WhatsApp / Unduh PDF buttons move into the preview column.
3. **Parallax may exceed the old documented 0.14 opacity ceiling** — target 0.28–0.35, denser ink, **6** invoice sheets.
4. The marketing headline *"Harga yang tepat, penawaran lebih cepat."* and the paragraph *"Hitung dari biaya Anda, tentukan margin, lalu buat penawaran yang rapi. Langsung di sini, tanpa perlu akun."* are **removed**. Only the three value bullets stay in the hero.
5. Hero must stay as simple as possible; everything explanatory scrolls below.

### Assumption to state in the PR/commit body

The page still needs exactly one `<h1>` for a11y/SEO and the existing tests. Because the marketing headline is gone, the `<h1>` becomes a small utility label: **"Ruang hitung QuoteKilat"**. It is rendered at ~0.95rem (not a display headline) so the hero stays quiet.

---

## 2. Architecture / proposed approach

The hero becomes a 2-column CSS grid — a narrow transparent copy rail and the builder card — and the builder card itself is a 2-column grid (inputs | result) whose second sibling is the new `<LiveInvoicePreview>`; visually that reads as three horizontal columns: **copy · calculator · invoice**.

The live preview is fed by a `useMemo` inside `QuoteBuilder` that builds a `QuoteSnapshot` from the current form values on every render, using a **per-mount stable** date + id suffix (new optional 6th parameter on `createQuote`), so the invoice number does not flicker while typing and the same number is reused by WhatsApp/PDF exports.

Everything else is CSS and deletion: the Radix preview dialog, `.quote-dialog` styles, and the duplicated `.hero-layout` rules go away; marketing sections keep their markup (and therefore their tests) and only get quieter styling.

---

## 3. File map

| File | Action |
|---|---|
| `src/lib/quotation/quote.ts` | add `randomQuoteSuffix()` + optional `idSuffix` param |
| `tests/unit/quotation.test.ts` | add stable-suffix tests |
| `src/components/quote-builder/LiveInvoicePreview.tsx` | **new** |
| `src/components/quote-builder/QuotePreview.tsx` | **delete** |
| `src/components/quote-builder/QuoteBuilder.tsx` | rewrite render tree + live quote memo |
| `src/components/quote-builder/quote-builder.css` | grid layout, compact panel, delete `.quote-dialog` rules |
| `src/components/landing/HeroCopy.tsx` | rewrite (h1 label + 3 bullets + note + downlink) |
| `src/components/landing/HeroParallaxLayers.tsx` | 6 sheets, 56px travel |
| `src/components/landing/landing.css` | new hero/preview/marketing CSS |
| `src/styles/global.css` | delete dead `.hero*` rules |
| `src/app/App.tsx` | hero shell markup |
| `src/components/landing/landing.test.tsx` | new h1 + no CTA |
| `src/components/landing/HeroParallaxLayers.test.tsx` | 6 sheets, 28px |
| `tests/components/QuoteBuilder.test.tsx` | live preview instead of dialog |
| `tests/e2e/guest.spec.ts` | 6 tests updated |
| `tests/e2e/routes.spec.ts` | 1 assertion updated |
| `IMPLEMENTATION_STATUS.md` | parallax + preview facts |

---

## 4. Verification commands (use these exact strings)

```bash
pnpm test                                   # expect: Test Files 26+ passed, Tests 378+ passed
pnpm typecheck                              # expect: no output, exit 0
pnpm lint                                   # expect: no output, exit 0
pnpm build                                  # expect: "✓ built in ...", dist/ written
pnpm test:e2e                               # expect: 24 passed (desktop + mobile projects)
```

Run a single file while iterating:

```bash
pnpm vitest run tests/unit/quotation.test.ts
```

---

## Phase 0 — Baseline (2 min)

**Task 0.1** Confirm the tree is green before touching anything.

```bash
cd "C:/Users/cubeb/OneDrive/Documents/coding/projects/QuoteKilat"
git status --short          # expect: empty
pnpm test                   # expect: Test Files 26 passed (26) · Tests 378 passed (378)
```

If `pnpm test` is not 378/26, stop and report the delta — do not "fix" it as part of this plan.

---

## Phase 1 — Stable quote number (TDD)

**Why:** the preview re-renders on every keystroke; `createQuote` currently randomises the suffix, so the invoice number would flicker and the PDF/WhatsApp number would differ from the one on screen.

### Task 1.1 — Failing test

File: `tests/unit/quotation.test.ts` — append inside the existing `describe('quotation snapshot', ...)` block:

```ts
  it('reuses a caller-supplied suffix so a live preview keeps one invoice number', () => {
    const now = new Date('2026-10-20T16:45:00.000Z')
    const first = createQuote(details, 'goods', 3, pricing, now, 'ABCDEF123456')
    const second = createQuote({ ...details, title: 'Cetak katalog v2' }, 'goods', 3, pricing, now, 'ABCDEF123456')
    expect(first.id).toBe('QK-20261020-ABCDEF123456')
    expect(second.id).toBe(first.id)
  })

  it('rejects a malformed suffix instead of minting a fake quote number', () => {
    const now = new Date('2026-10-20T16:45:00.000Z')
    expect(() => createQuote(details, 'goods', 3, pricing, now, 'nope')).toThrow(/Sufiks/)
    expect(() => createQuote(details, 'goods', 3, pricing, now, 'abcdef123456')).toThrow(/Sufiks/)
  })
```

Run:

```bash
pnpm vitest run tests/unit/quotation.test.ts
```

Expected: **2 failed** — `createQuote` ignores the 6th argument (`TypeError: ... is not a function` is not expected; the failure is `expected 'QK-...-<random>' to be 'QK-20261020-ABCDEF123456'` and "no error thrown").

### Task 1.2 — Implement

File: `src/lib/quotation/quote.ts`. Replace the import block + `createQuote` signature and the suffix generation:

```ts
const SUFFIX_PATTERN = /^[A-F0-9]{12}$/

/** Random 12-char uppercase hex suffix for a new quote number. */
export function randomQuoteSuffix(): string {
  const random = crypto.getRandomValues(new Uint8Array(6))
  return Array.from(random, (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase()
}
```

and change the signature / id line:

```ts
export function createQuote(
  details: QuoteDetails,
  mode: QuoteMode,
  quantity: number,
  pricing: PricingResult,
  now: Date = new Date(),
  /** Pass a stable suffix to keep one invoice number across live re-renders. */
  idSuffix: string = randomQuoteSuffix(),
): QuoteSnapshot {
  if (!SUFFIX_PATTERN.test(idSuffix)) {
    throw new Error('Sufiks nomor penawaran harus 12 karakter heksadesimal A–F/0–9.')
  }
```

Delete the now-unused local `const random = ...` / `const suffix = ...` lines inside the function body and use:

```ts
    id: `QK-${createdAt.slice(0, 10).replaceAll('-', '')}-${idSuffix}`,
```

### Task 1.3 — Verify + commit

```bash
pnpm vitest run tests/unit/quotation.test.ts   # expect: 12 passed (10 existing + 2 new)
pnpm typecheck                                 # expect: exit 0
git add src/lib/quotation/quote.ts tests/unit/quotation.test.ts
git commit -m "feat(quote): allow a stable invoice-number suffix for live previews"
```

---

## Phase 2 — `LiveInvoicePreview` component (TDD)

### Task 2.1 — Failing test

New file: `tests/components/LiveInvoicePreview.test.tsx`

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LiveInvoicePreview } from '../../src/components/quote-builder/LiveInvoicePreview'
import { createQuote } from '../../src/lib/quotation/quote'
import type { PricingResult } from '../../src/lib/pricing/types'

const pricing: PricingResult = {
  baseCost: 175000, minimumPrice: 250000, roundedPrice: 250000, discountAmount: 0,
  finalPrice: 250000, sellingFees: 0, profit: 75000, actualMarginBps: 3000,
  belowTarget: false, unitPrice: 250000, costLines: [{ label: 'BIAYA RAHASIA', amount: 175000 }],
}

const quote = createQuote(
  { title: 'Hampers custom', businessName: 'Toko Uji', customerName: 'Budi', notes: '', validDays: 7 },
  'goods', 1, pricing, new Date('2026-10-20T16:45:00.000Z'), 'ABCDEF123456',
)

describe('LiveInvoicePreview', () => {
  it('renders the customer-facing invoice and never the internal cost lines', () => {
    render(<LiveInvoicePreview quote={quote} busy={false} onCopy={vi.fn()} onPdf={vi.fn()} />)
    const panel = screen.getByRole('complementary', { name: 'Pratinjau penawaran langsung' })
    expect(panel).toHaveTextContent('Hampers custom')
    expect(panel).toHaveTextContent('250.000')
    expect(panel).toHaveTextContent('QK-20261020-ABCDEF123456')
    expect(panel).not.toHaveTextContent('BIAYA RAHASIA')
  })

  it('explains the empty state and disables both exports', () => {
    render(<LiveInvoicePreview quote={null} busy={false} onCopy={vi.fn()} onPdf={vi.fn()} />)
    expect(screen.getByText(/Isi nama item dan biaya/i)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Salin WhatsApp' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Unduh PDF' })).toBeDisabled()
  })

  it('wires copy and download and shows the busy label', async () => {
    const onCopy = vi.fn()
    const onPdf = vi.fn()
    const view = render(<LiveInvoicePreview quote={quote} busy={false} onCopy={onCopy} onPdf={onPdf} />)
    await userEvent.click(screen.getByRole('button', { name: 'Salin WhatsApp' }))
    await userEvent.click(screen.getByRole('button', { name: 'Unduh PDF' }))
    expect(onCopy).toHaveBeenCalledTimes(1)
    expect(onPdf).toHaveBeenCalledTimes(1)
    view.rerender(<LiveInvoicePreview quote={quote} busy onCopy={onCopy} onPdf={onPdf} />)
    expect(screen.getByRole('button', { name: 'Membuat PDF…' })).toBeDisabled()
  })
})
```

Run:

```bash
pnpm vitest run tests/components/LiveInvoicePreview.test.tsx
```

Expected: **fail** — `Failed to resolve import "../../src/components/quote-builder/LiveInvoicePreview"`.

### Task 2.2 — Implement

New file: `src/components/quote-builder/LiveInvoicePreview.tsx`

```tsx
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
            <p className="quote-paper-footer">Terima kasih atas kepercayaan Anda.</p>
          </div>
        ) : (
          <p className="live-empty">Isi nama item dan biaya untuk melihat penawaran di sini.</p>
        )}
      </div>

      <div className="live-actions">
        <button type="button" className="button button-secondary" disabled={!quote} onClick={onCopy}>
          <MessageCircle size={16} aria-hidden="true" /> Salin WhatsApp
        </button>
        <button type="button" className="button button-primary" disabled={!quote || busy} onClick={onPdf}>
          <Download size={16} aria-hidden="true" /> {busy ? 'Membuat PDF…' : 'Unduh PDF'}
        </button>
      </div>

      <p className="live-note">
        <FileText size={12} aria-hidden="true" />
        Biaya internal dan margin tidak ikut diekspor.
      </p>
    </aside>
  )
}
```

Note: the existing `.quote-paper*` classes from `quote-builder.css` are reused on purpose — they are restyled/scaled for the narrow column in Phase 6. Do **not** rename them; E2E asserts on `.quote-paper`-adjacent text and the PDF id.

### Task 2.3 — Verify + commit

```bash
pnpm vitest run tests/components/LiveInvoicePreview.test.tsx   # expect: 3 passed
git add src/components/quote-builder/LiveInvoicePreview.tsx tests/components/LiveInvoicePreview.test.tsx
git commit -m "feat(preview): add always-on live invoice preview component"
```

---

## Phase 3 — Wire the builder to the live preview, delete the dialog

### Task 3.1 — Update the component test first (TDD)

File: `tests/components/QuoteBuilder.test.tsx`

Replace the first test:

```tsx
it('calculates a guest quote and shows it in the live preview without registration', async () => {
  renderGuest()
  expect(screen.getByLabelText('Harga jual penawaran')).toHaveTextContent(/250[.]000/)
  const preview = screen.getByRole('complementary', { name: 'Pratinjau penawaran langsung' })
  expect(preview).toHaveTextContent('Hampers custom')
  expect(preview).toHaveTextContent(/250[.]000/)
  expect(preview).not.toHaveTextContent('Biaya dasar')
  expect(screen.queryByRole('button', { name: 'Buat Penawaran' })).not.toBeInTheDocument()
})
```

Replace the last test (smart input) with:

```tsx
it('renders the live smart input panel inside the builder when the flag is on', async () => {
  renderGuest()
  await userEvent.click(screen.getByText(/Simpan, draft & AI/))
  expect(screen.getByRole('region', { name: /Smart Input/i })).toBeVisible()
  // The form around it must still work: a priced quote proves the context survived.
  expect(screen.getByLabelText('Harga jual penawaran')).toHaveTextContent(/250[.]000/)
})
```

Run:

```bash
pnpm vitest run tests/components/QuoteBuilder.test.tsx
```

Expected: **3 failed** (no complementary landmark, "Buat Penawaran" still present, no "Simpan, draft & AI" summary).

### Task 3.2 — Rewrite `src/components/quote-builder/QuoteBuilder.tsx`

Write the file with exactly this content:

```tsx
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
```

Then delete the old dialog component:

```bash
git rm src/components/quote-builder/QuotePreview.tsx
```

Run:

```bash
pnpm vitest run tests/components/QuoteBuilder.test.tsx   # expect: 4 passed
pnpm typecheck                                            # expect: exit 0
```

If `typecheck` complains about an unused `QuotePreview` import elsewhere, `grep -rn "QuotePreview" src tests` and remove that reference (only `QuoteBuilder.tsx` should have had it).

### Task 3.3 — Commit

```bash
git add -A src/components/quote-builder tests/components/QuoteBuilder.test.tsx
git commit -m "refactor(builder): drive the invoice from a live snapshot and drop the preview dialog"
```

---

## Phase 4 — Hero shell: 3 horizontal columns (TDD)

### Task 4.1 — Update `HeroCopy` test

Replace `src/components/landing/landing.test.tsx` entirely:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HeroCopy } from './HeroCopy'

describe('HeroCopy', () => {
  it('keeps the hero to a utility label, three value bullets and a way down', () => {
    render(<HeroCopy />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Ruang hitung QuoteKilat')
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByText('Satu alat untuk barang, jasa, dan pesanan custom')).toBeVisible()
    expect(screen.getByText('Biaya, laba, dan margin terlihat jelas')).toBeVisible()
    expect(screen.getByText('Siap disalin ke WhatsApp atau diunduh sebagai PDF')).toBeVisible()
    expect(screen.getByRole('link', { name: /Paket & Pro/i })).toHaveAttribute('href', '#harga')
    expect(screen.queryByText(/Harga yang tepat, penawaran lebih cepat/)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /daftar|masuk/i })).not.toBeInTheDocument()
  })
})
```

Run:

```bash
pnpm vitest run src/components/landing/landing.test.tsx   # expect: 1 failed
```

### Task 4.2 — Rewrite `src/components/landing/HeroCopy.tsx`

```tsx
import { ArrowDown, CheckCircle2 } from 'lucide-react'

const values = [
  'Satu alat untuk barang, jasa, dan pesanan custom',
  'Biaya, laba, dan margin terlihat jelas',
  'Siap disalin ke WhatsApp atau diunduh sebagai PDF',
]

export function HeroCopy() {
  return (
    <div className="qk-hero-copy">
      <h1 className="qk-hero-h1" id="hero-title">
        Ruang hitung QuoteKilat
      </h1>

      <ul className="qk-hero-values">
        {values.map((value) => (
          <li key={value}>
            <CheckCircle2 size={16} strokeWidth={1.8} aria-hidden="true" />
            <span>{value}</span>
          </li>
        ))}
      </ul>

      <p className="qk-hero-note">
        Gratis <span aria-hidden="true">·</span> tanpa akun <span aria-hidden="true">·</span> data tetap di perangkat
      </p>

      <a className="qk-hero-down" href="#harga">
        Paket &amp; Pro
        <ArrowDown size={14} aria-hidden="true" />
      </a>
    </div>
  )
}
```

### Task 4.3 — Update `Home()` in `src/app/App.tsx`

Replace line 16:

```tsx
function Home() {
  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <HeroParallaxLayers />
        <div className="hero-shell">
          <HeroCopy />
          <QuoteBuilder />
        </div>
      </section>
      <MarketingSections />
    </>
  )
}
```

Leave `Navigation`, `Footer`, `NotFound`, `RouteEffects` untouched in this task.

### Task 4.4 — Verify + commit

```bash
pnpm vitest run src/components/landing/landing.test.tsx   # expect: 1 passed
pnpm typecheck                                            # expect: exit 0
git add src/components/landing/HeroCopy.tsx src/components/landing/landing.test.tsx src/app/App.tsx
git commit -m "feat(landing): turn the hero into a horizontal calculator shell"
```

Layout will look broken until Phase 6 lands the CSS — that is expected; do not "fix" it by editing markup.

---

## Phase 5 — Stronger parallax (TDD)

### Task 5.1 — Update the parallax test

File: `src/components/landing/HeroParallaxLayers.test.tsx`

- In the first test, change `toHaveLength(3)` → `toHaveLength(6)` and rename the test to `keeps exactly six decorative sheets outside the accessibility tree`.
- In the third test (`bounds scroll displacement ...`), change `expect(layers.style.getPropertyValue('--qk-parallax')).toBe('12px')` → `'28px'` and rename it to mention 56px.

Run:

```bash
pnpm vitest run src/components/landing/HeroParallaxLayers.test.tsx   # expect: 3 failed (6 sheets, 28px)
```

### Task 5.2 — Implement

`src/components/landing/HeroParallaxLayers.tsx`, two edits:

```tsx
      // Near sheet travels at most 56px; the other sheets use smaller CSS factors.
      layers.style.setProperty('--qk-parallax', `${progress * 56}px`)
```

```tsx
      {[1, 2, 3, 4, 5, 6].map((sheet) => (
```

Leave everything else (media-query handling, RAF cleanup, `aria-hidden`) untouched.

### Task 5.3 — Verify + commit

```bash
pnpm vitest run src/components/landing/HeroParallaxLayers.test.tsx   # expect: 4 passed
git add src/components/landing/HeroParallaxLayers.tsx src/components/landing/HeroParallaxLayers.test.tsx
git commit -m "feat(landing): six denser parallax sheets with 56px travel"
```

---

## Phase 6 — CSS: the actual redesign

All of this is plain CSS. Replace blocks by exact anchors; do not reformat untouched rules.

### Task 6.1 — Delete dead hero rules from `src/styles/global.css`

Delete these three lines (currently 35–37):

```css
.hero { position:relative; isolation:isolate; overflow:clip; background:#f4f6fb; border-bottom:1px solid var(--line); }
.hero-layout { display:grid; grid-template-columns:minmax(0,.92fr) minmax(0,1.08fr); gap:60px; position:relative; align-items:start; padding-block:66px 76px; z-index:1; }
.hero-copy { padding-top:105px; }
```

In the `@media(max-width:1100px)` line, remove ` .hero-layout { gap:35px; grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr); padding-block:45px 55px; } .hero-copy { padding-top:100px; }`.

In the `@media(max-width:800px)` line, remove `.hero-layout { grid-template-columns:1fr; gap:30px; max-width:620px; } .hero-copy { padding-top:0; }`.

In the `@media(max-width:540px)` line, remove `.qk-hero-values,.qk-hero-cta { display:none; }` and `.hero-layout { padding-top:32px; padding-bottom:36px; gap:27px; }` — **this is critical**: those bullets are now the only hero copy and must never be hidden.

Delete the line `@media(min-width:801px) { .qk-hero-copy { padding-top:70px; } }`.

Verify nothing still references the removed selectors:

```bash
grep -rn "hero-layout\|hero-copy\b" src --include=*.css --include=*.tsx
# expect: no output
```

### Task 6.2 — Replace the hero block in `src/components/landing/landing.css`

Replace **lines 1–145** (from the `/* Landing and legal styles only... */` comment through the last `.qk-invoice-sheet-3 { ... }` rule) with:

```css
/* Landing and legal styles only. Shared tokens and .button/.container come from the app shell. */

/* ── Hero shell: copy rail · calculator · live invoice ─────────────────── */
.hero {
  position: relative;
  isolation: isolate;
  overflow: clip;
  border-bottom: 1px solid var(--line);
  background: radial-gradient(120% 90% at 8% -12%, #e6ecff 0%, #f3f6fc 46%, #f7f9fd 100%);
}

/* Faint grid + ink wash: the "khas QuoteKilat" background, visible around the cards. */
.hero::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background-image: radial-gradient(#c3cff0 1px, transparent 1px);
  background-size: 26px 26px;
  opacity: 0.55;
  -webkit-mask-image: radial-gradient(120% 85% at 50% 0%, #000 10%, transparent 70%);
  mask-image: radial-gradient(120% 85% at 50% 0%, #000 10%, transparent 70%);
}

.hero-shell {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 14.5rem minmax(0, 1fr);
  align-items: start;
  gap: 1.75rem;
  width: min(1320px, calc(100% - 40px));
  margin-inline: auto;
  padding-block: 2.25rem 2.75rem;
}

/* ── Copy rail ─────────────────────────────────────────────────────────── */
.qk-hero-copy {
  display: grid;
  gap: 1.1rem;
  align-content: start;
  padding-top: 0.4rem;
  color: var(--ink, #17223c);
}

.qk-hero-h1 {
  margin: 0;
  color: var(--ink, #17223c);
  font-size: 0.95rem;
  font-weight: 750;
  line-height: 1.4;
  letter-spacing: -0.02em;
}

.qk-hero-values {
  display: grid;
  gap: 0.8rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.qk-hero-values li {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  color: #43516c;
  font-size: 0.74rem;
  line-height: 1.65;
}

.qk-hero-values svg {
  flex: 0 0 auto;
  margin-top: 0.12rem;
  color: var(--accent, #4b66d8);
}

.qk-hero-note {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem;
  margin: 0;
  color: var(--muted, #52617d);
  font-size: 0.66rem;
  line-height: 1.7;
}

.qk-hero-down {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 40px;
  color: #3c4fa0;
  font-size: 0.7rem;
  font-weight: 650;
  text-decoration: none;
}

.qk-hero-down:hover { text-decoration: underline; text-underline-offset: 3px; }

/* ── Parallax: 6 invoice sheets, opacity 0.20–0.30, no blur ────────────── */
.qk-hero-layers {
  position: absolute;
  z-index: 0;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  user-select: none;
  --qk-parallax: 0px;
}

.qk-invoice-sheet {
  position: absolute;
  display: block;
  width: 190px;
  height: auto;
  color: #3b52b8;
  opacity: 0.26;
  transform-origin: center;
}

/* Sheets must sit behind the transparent copy rail or the hero gutters:
   the builder and preview cards are opaque, so a sheet behind them is invisible. */
.qk-invoice-sheet-1 { top: 2%;  left: 1%;   width: 150px; opacity: 0.30; transform: translateY(calc(var(--qk-parallax) * 0.30)) rotate(-3deg); }
.qk-invoice-sheet-2 { top: 34%; left: 6%;   width: 118px; opacity: 0.26; transform: translateY(calc(var(--qk-parallax) * 0.55)) rotate(2.4deg); }
.qk-invoice-sheet-3 { top: 62%; left: 0;    width: 168px; opacity: 0.28; transform: translateY(calc(var(--qk-parallax) * 0.75)) rotate(-1.6deg); }
.qk-invoice-sheet-4 { top: 0;   right: 0;   width: 132px; opacity: 0.24; transform: translateY(calc(var(--qk-parallax) * 0.42)) rotate(1.8deg); }
.qk-invoice-sheet-5 { bottom: 0; right: 1%; width: 176px; opacity: 0.22; transform: translateY(calc(var(--qk-parallax) * 0.90)) rotate(-2deg); }
.qk-invoice-sheet-6 { top: 44%; right: 6%;  width: 96px;  opacity: 0.20; transform: translateY(calc(var(--qk-parallax) * 1))    rotate(1deg); }
```

Keep the reduced-motion rule at the bottom of the file, but drop the now-orphaned `.qk-builder-cue svg` selector from it — it becomes:

```css
@media (prefers-reduced-motion: reduce) {
  .qk-invoice-sheet { transform: none !important; }
  .qk-faq-plus { transition: none; }
}
```

### Task 6.3 — Responsive hero

Append to `src/components/landing/landing.css`, **above** the existing `@media (max-width: 1100px)` block:

```css
@media (max-width: 1180px) {
  .hero-shell { grid-template-columns: 1fr; gap: 1.25rem; width: calc(100% - 40px); }
  .qk-hero-copy { gap: 0.85rem; }
  .qk-hero-values { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.6rem 1.5rem; }
}

@media (max-width: 720px) {
  .hero-shell { width: calc(100% - 32px); padding-block: 1.25rem 1.75rem; gap: 1rem; }
  .qk-hero-values { grid-template-columns: 1fr; }
  .qk-hero-h1 { font-size: 0.9rem; }
  .qk-hero-down { min-height: 44px; }
  .qk-hero-layers { display: none; }
}
```

### Task 6.4 — `src/components/quote-builder/quote-builder.css`: layout + preview column

Replace the first rule (`.quote-builder { ... }`) with:

```css
.quote-builder { display:grid; grid-template-columns:minmax(0,1fr) 22.5rem; gap:1.1rem; align-items:start; min-width:0; scroll-margin-top:1.5rem; }
.builder-panel { background:var(--surface); border:1px solid #e7ecf7; border-radius:18px; padding:1.15rem; box-shadow:0 18px 50px -34px #2638674d; min-width:0; }
.builder-body { display:grid; grid-template-columns:minmax(0,1fr) 14.5rem; gap:1.1rem; align-items:start; }
.builder-inputs { min-width:0; }
.builder-result { display:grid; gap:.6rem; align-content:start; min-width:0; position:sticky; top:1rem; }
```

Append the preview-column styles (after the `.builder-actions` block):

```css
/* ── Live invoice column ─────────────────────────────────────────────── */
.live-invoice { display:grid; gap:.7rem; min-width:0; position:sticky; top:1rem; }
.live-invoice-head { display:flex; align-items:center; justify-content:space-between; gap:.5rem; }
.live-invoice-head .eyebrow { font-size:9px; letter-spacing:.14em; color:#42527d; }
.live-flag { display:inline-flex; align-items:center; gap:5px; font-size:8px; font-weight:650; color:#0d7a52; }
.live-dot { width:6px; height:6px; border-radius:50%; background:#12a56b; box-shadow:0 0 0 3px #12a56b26; }
.live-paper { background:#fff; border:1px solid #e3e9f5; border-radius:12px; padding:1.1rem; box-shadow:0 16px 44px -32px #1d2c5266; min-height:20rem; }
.live-empty { margin:0; color:var(--muted); font-size:.74rem; line-height:1.8; }
.live-actions { display:grid; grid-template-columns:1fr 1fr; gap:.5rem; }
.live-actions .button { min-height:42px; padding-inline:.5rem; font-size:.68rem; gap:.35rem; }
.live-note { display:flex; align-items:center; gap:.35rem; margin:0; color:var(--muted); font-size:.62rem; line-height:1.7; }
```

Then **scale the paper down** — append after the existing `.quote-paper*` rules (keep those rules; they are still the single source of truth for the paper look):

```css
.live-paper .quote-paper { border:0; border-radius:0; padding:0; }
.live-paper .quote-paper-heading h2 { margin-top:.4rem; font-size:1rem; }
.live-paper .quote-brand { font-size:.6rem; }
.live-paper .eyebrow { font-size:8px; }
.live-paper .quote-meta { font-size:.6rem; padding-bottom:.85rem; gap:.35rem; }
.live-paper .customer-line { margin:.85rem 0; font-size:.66rem; }
.live-paper .quote-line-item { padding-block:.95rem; gap:.6rem; }
.live-paper .quote-line-item h3 { font-size:.78rem; margin-bottom:.2rem; }
.live-paper .quote-line-item p { font-size:.62rem; }
.live-paper .quote-line-item > strong { font-size:.74rem; }
.live-paper .quote-totals { padding-top:.7rem; }
.live-paper .quote-totals > div { font-size:.66rem; padding:.18rem 0; }
.live-paper .quote-grand-total { font-size:.92rem !important; }
.live-paper .quote-terms { margin-top:.9rem; font-size:.6rem; line-height:1.75; }
.live-paper .quote-paper-footer { margin-top:.9rem; padding-top:.9rem; font-size:.58rem; }
```

Compress the internal summary so it fits the 14.5rem result column — replace `.pricing-summary { ... }` and `.selling-price { ... }`:

```css
.pricing-summary { background:#f1f8f5; border:1px solid #e5f1eb; border-radius:12px; padding:13px; font-variant-numeric:tabular-nums; min-height:0; }
.selling-price { display:block; font-size:25px; font-weight:750; line-height:1.4; letter-spacing:-1px; color:var(--green); padding:2px 0 7px; overflow-wrap:anywhere; }
```

Replace `.builder-reassurance { ... }` so it sits under the summary:

```css
.builder-reassurance { display:flex; align-items:center; justify-content:flex-start; flex-wrap:wrap; gap:4px; font-size:8px; color:#65718a; line-height:1.7; margin:0; }
```

Add the extras disclosure styles (before `.draft-controls`):

```css
.builder-extras { margin-top:.9rem; border-top:1px solid var(--line); }
.builder-extras > summary { display:flex; align-items:center; gap:7px; min-height:44px; font-size:10px; font-weight:600; color:#475571; cursor:pointer; list-style:none; }
.builder-extras > summary::before { content:'+'; width:12px; font-size:15px; font-weight:400; }
.builder-extras[open] > summary::before { content:'−'; }
.builder-extras > summary span { margin-left:auto; font-size:9px; font-weight:400; color:var(--muted); }
.builder-extras-body { padding-bottom:6px; }
```

Delete the dialog-only rules that no longer have markup — `.quote-dialog,` from the combined selector, `.preview-description`, `.preview-actions`, and the `.quote-dialog`/`.preview-*` entries inside the `@media(max-width:540px)` block. Concretely, change:

```css
.quote-dialog,.manual-dialog { ... }
```
to
```css
.manual-dialog { ... }
```

and delete `.preview-description { ... }` and `.preview-actions { ... }` lines, plus inside the 540px media query delete `.quote-dialog { padding:17px; }`, `.quote-paper { padding:20px; }`, `.quote-paper-heading { display:block; }`, `.quote-paper-heading h2 { font-size:20px; }`, `.quote-brand { display:none; }`, `.quote-grand-total { font-size:15px!important; }`, `.preview-actions { flex-wrap:wrap; }`, `.preview-actions .button { flex:1; font-size:11px; padding-inline:10px; }`.

Add the builder responsive rules at the end of the file:

```css
@media (max-width:1360px) {
  .quote-builder { grid-template-columns:minmax(0,1fr) 19.5rem; }
  .builder-body { grid-template-columns:minmax(0,1fr) 13rem; }
}
@media (max-width:1180px) {
  .quote-builder { grid-template-columns:minmax(0,1fr); }
  .builder-result { position:static; grid-template-columns:minmax(0,1fr); }
  .live-invoice { position:static; }
}
@media (max-width:900px) {
  .builder-body { grid-template-columns:minmax(0,1fr); }
  .live-paper { min-height:0; }
}
@media (max-width:540px) {
  .builder-panel { padding:14px; border-radius:14px; }
  .live-actions { grid-template-columns:1fr; }
}
```

Finally delete the now-orphaned rules (their markup is gone): `.builder-actions { ... }`, `.builder-actions .button-primary { ... }`, `.export-icon { ... }`, `.export-icon:first-of-type { ... }`, and inside the 540px media query `.builder-actions { gap:7px; }`, `.builder-actions .button { font-size:11px; }`, `.export-icon { width:44px; }`.

Confirm nothing references them:

```bash
grep -rn "builder-actions\|export-icon\|quote-dialog\|preview-actions" src --include=*.tsx --include=*.css
# expect: no output
```

### Task 6.5 — Marketing sections: quieter, and Pro clearly below the fold

Append to `src/components/landing/landing.css`:

```css
/* Below the fold: everything explanatory lives here, quieter than the hero. */
.qk-benefit-strip { background:var(--surface); }
.qk-section { padding:4.5rem 0; }
.qk-plan-active { border-color:#b9c4ee; }
.qk-plans .qk-plan:last-child { border-color:#dfe5f4; background:linear-gradient(180deg,#fbfcff,#fff); }
```

(Do not change `MarketingSections.tsx` markup — its tests assert the exact section ids, headings, plan names and `—` placeholders.)

### Task 6.6 — Legal & pricing pages

Append to `src/components/landing/landing.css`:

```css
.pricing-page-heading { padding-block:3.5rem 0; }
.pricing-page-heading h1 { margin:0; font-size:clamp(1.7rem,3vw,2.4rem); font-weight:700; letter-spacing:-.045em; }
.pricing-page-heading p { margin:.8rem 0 0; color:var(--muted); font-size:.9rem; line-height:1.8; }
```

### Task 6.7 — Verify + commit

```bash
pnpm typecheck     # expect: exit 0
pnpm lint          # expect: exit 0
pnpm test          # expect: all files pass (count may shift by ±1 file from the new LiveInvoicePreview test)
pnpm build         # expect: "✓ built in ..." and dist/ written
git add src/components/landing/landing.css src/components/quote-builder/quote-builder.css src/styles/global.css
git commit -m "style(ui): horizontal three-column hero, scaled live invoice, quieter below-fold sections"
```

Visual smoke check (do this, do not skip):

```bash
pnpm dev
```

Open `http://127.0.0.1:5173/` and confirm, at 1440px wide: three columns visible without horizontal scroll, invoice paper updates as you type the product name, invoice number does not change between keystrokes, six faint invoice sheets visible in the left rail and right gutter, "Paket & Pro" scrolls to `#harga`.

---

## Phase 7 — E2E updates

### Task 7.1 — `tests/e2e/routes.spec.ts`

Replace line 21:

```ts
  await expect(page.getByLabel('Nama produk')).toBeVisible()
```

### Task 7.2 — `tests/e2e/guest.spec.ts` — six targeted edits

**(a)** Test 1 (`guest can preview, copy ...`) → replace its body's first block (lines 7–16) with:

```ts
test('guest sees a live invoice, copies real WhatsApp text and downloads a real PDF', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ruang hitung QuoteKilat')
  const preview = page.getByRole('complementary', { name: 'Pratinjau penawaran langsung' })
  await expect(preview).toContainText('Hampers custom')
  await expect(preview).toContainText('250.000')
  await expect(preview).not.toContainText('Biaya dasar')
```

then keep the existing clipboard + PDF assertions, but change the two dialog-scoped clicks and the final focus check:

```ts
  await preview.getByRole('button', { name: 'Salin WhatsApp' }).click()
```

```ts
  await preview.getByRole('button', { name: 'Unduh PDF' }).click()
```

and delete these two lines at the end of that test (no dialog to close, no focus to return):

```ts
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Buat Penawaran' })).toBeFocused()
```

Also add, right after the first price assertion, a realtime proof:

```ts
  await page.getByLabel('Jumlah barang', { exact: true }).fill('3')
  await expect(preview).toContainText('750.000')
  await page.getByLabel('Jumlah barang', { exact: true }).fill('1')
  await expect(preview).toContainText('250.000')
```

**(b)** Test 2 (`fees use gross margin ...`) — last two lines: replace

```ts
  await expect(page.getByRole('button', { name: 'Buat Penawaran' })).toBeDisabled()
```

with

```ts
  await expect(page.getByRole('button', { name: 'Unduh PDF' })).toBeDisabled()
```

**(c)** Test 4 (`invalid inputs ...`) — replace

```ts
  await expect(page.getByRole('button', { name: 'Unduh PDF', exact: true })).toBeDisabled()
```

with (the same selector still resolves — one button now):

```ts
  await expect(page.getByRole('button', { name: 'Unduh PDF', exact: true })).toBeDisabled()
  await expect(page.getByRole('complementary', { name: 'Pratinjau penawaran langsung' })).toContainText(/Isi nama item/)
```

**(d)** Test 5 (`draft survives reload ...`) — no change; it only touches inputs and localStorage.

**(e)** Test `blocked storage stays non-blocking ...` — replace

```ts
  await page.getByRole('button', { name: 'Buat Penawaran' }).click()
  await expect(page.getByRole('dialog').getByRole('heading', { name: title, exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.querySelectorAll('[role=dialog] img').length)).toBe(0)
```

with

```ts
  await expect(page.getByRole('complementary', { name: 'Pratinjau penawaran langsung' }).getByRole('heading', { name: title, exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.querySelectorAll('.live-paper img').length)).toBe(0)
```

**(f)** Test `no remote APIs ...` — replace `await expect(page.getByRole('button', { name: 'Buat Penawaran' })).toBeEnabled()` with `await expect(page.getByRole('button', { name: 'Unduh PDF' })).toBeEnabled()`.

**(g)** Test `WCAG A/AA automated scan ...` — delete the three dialog lines (click, second axe scan on the dialog) and keep only the page-level scan:

```ts
test('WCAG A/AA automated scan has no violations', async ({ page }) => {
  await page.goto('/')
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([])
})
```

**(h)** Test `responsive viewports ...` — last line: replace `await expect(page.getByRole('button', { name: 'Buat Penawaran' })).toBeEnabled()` with `await expect(page.getByRole('button', { name: 'Unduh PDF' })).toBeEnabled()`.

### Task 7.3 — Run E2E

```bash
pnpm build && pnpm test:e2e
```

Expected: `24 passed` (12 tests × 2 projects). If axe reports a violation on the new `<aside>`, the usual causes are a missing accessible name (already set via `aria-label`) or colour contrast in `.live-note`/`.live-flag` — raise the colour to `#4a5875` for `.live-note` and `#0b6b48` for `.live-flag` and re-run.

### Task 7.4 — Commit

```bash
git add tests/e2e
git commit -m "test(e2e): assert the live invoice preview instead of the removed dialog"
```

---

## Phase 8 — Docs + final gate

### Task 8.1 — `IMPLEMENTATION_STATUS.md`

In the parallax bullet, replace the sentence describing three layers / opacity 0.14 / 24px with:

> Enam lapis kertas invoice SVG di hero: opacity 0.20–0.30 (tanpa blur), rotasi ≤3°, gerak maksimum 56px dibagi faktor per layer, passive scroll + `resize`, RAF dibatalkan saat unmount. Mobile ≤768px disembunyikan, `prefers-reduced-motion` menonaktifkan seluruh transform.

In the "Fitur yang berfungsi" list, replace the preview bullet with:

> Pratinjau invoice realtime sebagai kolom ketiga hero (selalu tampil, `aria-live`), nomor invoice stabil per sesi lewat sufiks tetap; salin teks WhatsApp dan PDF nyata dibuat dari snapshot yang sama. Dialog "Buat Penawaran" dihapus.

### Task 8.2 — Final gate

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
pnpm test:e2e
git status --short        # expect: only IMPLEMENTATION_STATUS.md modified
git add IMPLEMENTATION_STATUS.md
git commit -m "docs: record the horizontal hero, live preview and denser parallax"
```

Report the actual numbers printed by `pnpm test` (files/tests) and `pnpm test:e2e` (passed count). Do not claim success without them.

---

## 5. Risks, tradeoffs, open questions

**Risks**

1. **Invoice-number churn.** If `quoteAnchor`/`quoteSuffix` are created outside `useState` initialisers (e.g. inline `new Date()` in the memo deps), the number regenerates every render and the PDF id will not match the screen. The tests in Phase 1 exist to catch the regression; keep the `useState(() => ...)` form exactly.
2. **`display: contents` trap.** Do not try to make `.quote-builder` a transparent grid participant. The plan uses `.hero-shell` (2 columns) + `.quote-builder` (2 columns) so the preview stays inside the builder's React state scope. Visually it is three columns; structurally it is two nested grids.
3. **Sticky columns.** `.builder-result` and `.live-invoice` are `position: sticky; top: 1rem`. Inside a `overflow: clip` hero this is fine, but if a future change makes `.hero` `overflow: hidden` on an ancestor of the sticky element, sticky silently stops working.
4. **Parallax visibility vs. opacity.** Sheets behind the opaque builder/preview cards are invisible regardless of opacity. Positions are deliberately biased to the copy rail (left 0–6%) and the outer gutters (right 0–6%). If the user still says "not clear enough", the next lever is *size and count*, not more opacity — 0.30 on 6 sheets is already near the legibility limit for text behind it.
5. **`details` + tests.** jsdom does not implement `<details>` content hiding, so `toBeVisible()` may pass even when closed in a real browser. The updated test clicks the summary anyway, which is correct behaviour either way.
6. **Bundle.** No new runtime dependency is added; `pdf-lib` stays dynamically imported. Initial JS should stay within a few KB of the current ~485 KB.

**Tradeoffs accepted**

- Hero is tall on desktop (~700–820px) because the whole calculator plus a full invoice must be visible at once. That is the user's explicit request ("mencakup seluruh tampilan ruang hitung"); the alternative — splitting fields across steps — would add clicks and break the "langsung pakai" promise.
- The three hero bullets are now the only above-the-fold marketing copy, so SEO relies on the below-fold sections plus the meta description in `index.html` (unchanged).
- Removing the dialog removes one keyboard focus-return path; the manual-copy fallback dialog keeps its Radix focus management, so the E2E focus assertion is deleted rather than replaced.

**Open questions (answer before or during implementation, defaults given)**

1. Should the nav pill stay "Coba gratis" (currently `#quote-builder`) or become "Paket & Pro" (`#harga`)? **Default: leave untouched** — the anchor now scrolls into the hero which is the calculator itself.
2. Is the Market Insights section (a "belum aktif" placeholder) still wanted on a "sesimpel mungkin" page? **Default: keep** — its tests and copy are honest and it costs one screen.
3. Mobile: should the live preview sit *above* the calculator (so a phone user sees the invoice first) or below it? **Default: below** — inputs first is the natural order, and the preview is sticky-free on mobile.

---

## Execution status — 2026-10-21

All phases executed via delegated subagents with controller-side verification. Every commit below was verified by the controller (`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:e2e`) before landing.

### Done

| Phase | Commit | What actually landed |
|---|---|---|
| 1 | `1b3eeaa` | `createQuote()` takes a 6th `idSuffix` param validated by `/^[A-F0-9]{12}$/`; `randomQuoteSuffix()` exported. 2 new tests. Test count was 20, not the 12 the plan guessed (the block uses `it.each`). |
| 2 | `cdaa6e4` | `LiveInvoicePreview.tsx` + 3 tests. RED confirmed as a module-resolution failure first. |
| 3 | `995fad2` | `QuoteBuilder.tsx` rewritten: `liveQuote` `useMemo` with a per-mount date+suffix, `LiveInvoicePreview` as a sibling of `.builder-panel`, `QuotePreview` import dropped, cloud/AI moved into one `builder-extras` disclosure. Manual-copy Radix dialog kept as the clipboard fallback. |
| 4 | `7380152` | `HeroCopy` → h1 `Ruang hitung QuoteKilat` (15.2px utility label), 3 bullets, privacy note, `#harga` downlink. `Home()` uses `.hero-shell`. |
| 5 | `a70eab7` | 6 parallax sheets, `progress * 56`. Test file had 5 tests, not 4 (`it.each` counts as 2). |
| 6 | `329916b` | landing.css hero block replaced (`.hero-shell` grid, `.hero::before` masked dot grid, 6 sheet positions at opacity 0.20–0.30 with blur removed), responsive 1180/720, below-fold polish; quote-builder.css gained the 2-col builder grid + live-invoice column + scaled paper; global.css lost the dead `.hero*` rules. |
| — | `c9a5cc0` | `vitest.config.ts` pins `env: { NODE_ENV: 'test' }`. Discovered mid-run: the shell exports `NODE_ENV=production`, which makes React resolve its production build and crashes RTL with `React.act is not a function` on any bare `pnpm vitest run`. |
| 7 | `b65d85c` | 8 edits to `guest.spec.ts`, 1 to `routes.spec.ts`. 24/24 E2E pass. |
| 8 | `92a77cc`, `12e0f53` | `IMPLEMENTATION_STATUS.md` records the 6-sheet/0.20–0.30/56px parallax and the realtime preview; paired cost fields stack below 380px. |

### Deviations from the plan, and why

1. **`.quote-signature` added to the invoice** (not in the plan). Stretching the preview column to match the 835px calculator card produced a 387px void inside the paper and pushed the export buttons below the fold. The fix was a real document ending — `Disiapkan oleh` / `Disetujui oleh` with rules — plus moving `.live-actions` above the paper. Column heights are now natural (`align-items: start`) with the invoice column sticky.
2. **Export toolbar moved above the document.** Below it, `Unduh PDF` sat at y≈890 on a 900px fold — technically visible, practically unreachable.
3. **`.field-grid` stacks below 380px.** At 360px the paired cost labels crowded the 2-column grid; 390px and up stay 2-column (verified 360/390/430).
4. **One assertion swapped in `QuoteBuilder.test.tsx`**: the "invalid input" test asserted the deleted `Buat Penawaran` button was disabled; it now asserts `Unduh PDF` is disabled. Same intent, one line.
5. **`scripts/ui-review.mjs` and `scripts/ui-geometry.mjs` were written then moved out of the repo** to `$TMPDIR/qk-ui-review/`. They use `document`/`getComputedStyle` inside `page.evaluate` and `eslint .` (browser globals not configured for `scripts/`) rejected them. They were verification scaffolding, not deliverables.

### Verified

```
pnpm typecheck  → exit 0
pnpm lint       → exit 0
pnpm test       → 27 files, 384 tests passed
pnpm build      → ✓ built in 852ms
pnpm test:e2e   → 24 passed (12 tests × desktop + mobile)
```

Browser probe at 360/390/430/1024/1280/1440px: `document.scrollWidth === window.innerWidth` at every width (no horizontal overflow), 6 parallax sheets present with computed opacity 0.30/0.26/0.28/0.24/0.22/0.20, invoice number identical before and after typing (`sameId: true`), quantity 1→3 moves the live total 250.000→750.000, mode switch re-renders the paper as `1 paket layanan`, and the `builder-extras` disclosure opens.

### Not done, needs a decision

- Nothing from the plan is unexecuted. The three "open questions" in section 5 were left at their defaults: nav pill still reads `Coba gratis` → `#quote-builder`, Market Insights still ships as an honest "belum aktif" placeholder, and mobile keeps the preview below the calculator.
- Production deploy is not part of this plan and was not run. Pushing `master` triggers the Vercel build.
