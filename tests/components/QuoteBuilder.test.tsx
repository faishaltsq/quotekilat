import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { clearTabDraft } from '../../src/lib/storage/tabDraft'
import { QuoteBuilder } from '../../src/components/quote-builder/QuoteBuilder'

// This file runs in the production configuration: flag on, panel mounted.
// QuoteBuilder reads the flag at import time, so the mock has to be hoisted.
vi.mock('../../src/lib/ai/flag', () => ({ smartInputEnabled: true }))
import { AuthProvider } from '../../src/lib/cloud/AuthProvider'

// The guest flow must work with no cloud configured at all, so the provider gets
// an explicit null config instead of reaching for import.meta.env.
const renderGuest = () => render(<AuthProvider config={null}><QuoteBuilder /></AuthProvider>)

beforeEach(() => { localStorage.clear(); clearTabDraft() })
it('calculates a guest quote and previews it without registration', async () => {
  renderGuest()
  expect(screen.getByLabelText('Harga jual penawaran')).toHaveTextContent(/250[.]000/)
  await userEvent.click(screen.getByRole('button', { name: 'Buat Penawaran' }))
  expect(await screen.findByRole('dialog', { name: 'Pratinjau penawaran' })).toBeVisible()
  expect(screen.getByRole('dialog')).not.toHaveTextContent('Biaya dasar')
})
it('updates service costs and prevents invalid quotes', async () => {
  renderGuest()
  await userEvent.click(screen.getByRole('tab', { name: 'Jasa' }))
  expect(screen.getByLabelText('Estimasi jam kerja')).toHaveValue('10')
  await userEvent.clear(screen.getByLabelText('Estimasi jam kerja'))
  expect(screen.getByRole('button', { name: 'Buat Penawaran' })).toBeDisabled()
  expect(screen.getByLabelText('Estimasi jam kerja')).toHaveAttribute('aria-invalid', 'true')
})
it('hides the cloud panel entirely when the deployment has no Supabase config', () => {
  renderGuest()
  expect(screen.queryByRole('heading', { name: /Simpan ke cloud/i })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Masuk & simpan/i })).not.toBeInTheDocument()
})

// Enabling the production flag shipped the panel outside the FormProvider, so
// useFormContext() returned null and the whole page died on form.control. The
// flag must render the real panel without taking the builder down with it.
it('renders the live smart input panel inside the builder when the flag is on', () => {
  renderGuest()
  expect(screen.getByRole('region', { name: /Smart Input/i })).toBeVisible()
  // The form around it must still work: a priced quote proves the context survived.
  expect(screen.getByLabelText('Harga jual penawaran')).toHaveTextContent(/250[.]000/)
})
