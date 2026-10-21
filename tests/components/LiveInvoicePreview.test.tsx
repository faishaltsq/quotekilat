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
