import { beforeEach, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { clearTabDraft } from '../../src/lib/storage/tabDraft'
import { QuoteBuilder } from '../../src/components/quote-builder/QuoteBuilder'
beforeEach(() => { localStorage.clear(); clearTabDraft() })
it('calculates a guest quote and previews it without registration', async () => {
  render(<QuoteBuilder />)
  expect(screen.getByLabelText('Harga jual penawaran')).toHaveTextContent(/250[.]000/)
  await userEvent.click(screen.getByRole('button', { name: 'Buat Penawaran' }))
  expect(await screen.findByRole('dialog', { name: 'Pratinjau penawaran' })).toBeVisible()
  expect(screen.getByRole('dialog')).not.toHaveTextContent('Biaya dasar')
})
it('updates service costs and prevents invalid quotes', async () => {
  render(<QuoteBuilder />)
  await userEvent.click(screen.getByRole('tab', { name: 'Jasa' }))
  expect(screen.getByLabelText('Estimasi jam kerja')).toHaveValue('10')
  await userEvent.clear(screen.getByLabelText('Estimasi jam kerja'))
  expect(screen.getByRole('button', { name: 'Buat Penawaran' })).toBeDisabled()
  expect(screen.getByLabelText('Estimasi jam kerja')).toHaveAttribute('aria-invalid', 'true')
})
