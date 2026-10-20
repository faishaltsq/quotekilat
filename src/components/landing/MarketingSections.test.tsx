import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MarketingSections } from './MarketingSections'

describe('MarketingSections', () => {
  it('provides the promised landing anchors and a three-step local workflow', () => {
    render(<MarketingSections />)
    for (const id of ['fitur', 'cara-kerja', 'harga', 'faq']) {
      expect(document.getElementById(id)).toBeInTheDocument()
    }
    const steps = document.getElementById('cara-kerja')!
    expect(within(steps).getAllByRole('listitem')).toHaveLength(3)
    expect(within(steps).getByRole('heading', { name: 'Masukkan biaya' })).toBeVisible()
    expect(within(steps).getByRole('heading', { name: 'Tentukan margin' })).toBeVisible()
    expect(within(steps).getByRole('heading', { name: 'Buat & bagikan' })).toBeVisible()
  })

  it('labels market research as inactive and never supplies fabricated prices or sources', () => {
    render(<MarketingSections />)
    const demo = screen.getByRole('article', { name: 'Market Insights' })
    expect(within(demo).getByText('Contoh tampilan')).toBeVisible()
    expect(within(demo).getByText('Belum aktif')).toBeVisible()
    expect(within(demo).queryByText(/Rp\s*\d/)).not.toBeInTheDocument()
    expect(within(demo).queryAllByRole('link')).toHaveLength(0)
    expect(within(demo).getAllByRole('cell').map((cell) => cell.textContent)).toEqual([
      '—', '—', '—', '—',
    ])
    expect(screen.getByRole('button', { name: /Cek harga pasar/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Smart Input/ })).toBeDisabled()
  })

  it('offers only Guest now and marks all account and Pro additions as future proposals', () => {
    render(<MarketingSections />)
    const guest = screen.getByRole('article', { name: 'Guest' })
    expect(within(guest).getByText('Rp0')).toBeVisible()
    expect(within(guest).getByRole('link')).toHaveAttribute('href', '/#quote-builder')
    for (const name of ['Free Account', 'Pro']) {
      const plan = screen.getByRole('article', { name })
      expect(within(plan).queryByRole('link')).not.toBeInTheDocument()
      expect(within(plan).queryByRole('button')).not.toBeInTheDocument()
      expect(within(plan).getByText('Rencana · belum aktif')).toBeVisible()
      for (const feature of within(plan).getAllByRole('listitem')) {
        expect(feature).toHaveTextContent('Nanti')
      }
    }
    expect(screen.getByText('Rp59.000')).toBeVisible()
    expect(within(screen.getByRole('article', { name: 'Pro' })).getByText(/usulan beta/)).toBeVisible()
  })

  it('exposes plain-language margin, tax and privacy answers in native disclosures', () => {
    render(<MarketingSections />)
    const summary = screen.getByText('Apa bedanya margin dan markup?')
    const disclosure = summary.closest('details')!
    expect(disclosure).not.toHaveAttribute('open')
    fireEvent.click(summary.closest('summary')!)
    expect(disclosure).toHaveAttribute('open')
    expect(disclosure).toHaveTextContent('harga jual')
    expect(screen.getByText('Apakah pajak sudah termasuk?')).toBeInTheDocument()
    expect(screen.getByText('Di mana data penawaran saya disimpan?')).toBeInTheDocument()
  })
})
