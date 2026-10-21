import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { LegalPage } from '../../app/LegalPage'

describe('LegalPage', () => {
  it('describes the implemented local-by-default privacy policy without modifying storage', () => {
    const write = vi.spyOn(Storage.prototype, 'setItem')
    const clear = vi.spyOn(Storage.prototype, 'clear')
    const { container } = render(<MemoryRouter><LegalPage kind="privacy" /></MemoryRouter>)
    expect(screen.getByRole('heading', { level: 1, name: 'Kebijakan Privasi' })).toBeVisible()
    expect(screen.getByText('Dokumen draf · Fase 1')).toBeVisible()
    expect(container).toHaveTextContent('localStorage')
    expect(container).toHaveTextContent('memori')
    expect(container).toHaveTextContent('secara eksplisit')
    expect(container).toHaveTextContent('hanya menghapus kunci draf milik QuoteKilat')
    expect(container).toHaveTextContent('tidak memakai analitik pihak ketiga')
    expect(container).toHaveTextContent('Integrasi opsional dan pelacakan')
    expect(screen.getByRole('link', { name: 'Syarat Penggunaan' })).toHaveAttribute('href', '/terms')
    expect(write).not.toHaveBeenCalled()
    expect(clear).not.toHaveBeenCalled()
  })

  it('labels future subscriptions and draft commercial terms honestly', () => {
    const { container } = render(<MemoryRouter><LegalPage kind="terms" /></MemoryRouter>)
    expect(screen.getByRole('heading', { level: 1, name: 'Syarat Penggunaan' })).toBeVisible()
    expect(screen.getByText('Dokumen draf · Fase 1')).toBeVisible()
    expect(container).toHaveTextContent('belum menghitung pajak')
    expect(container).toHaveTextContent('Tidak ada pembelian')
    expect(container).toHaveTextContent('usulan beta')
    expect(screen.getByRole('link', { name: 'Kebijakan Privasi' })).toHaveAttribute('href', '/privacy')
    expect(screen.getByRole('link', { name: 'Kembali ke kalkulator' })).toHaveAttribute('href', '/')
  })
})
