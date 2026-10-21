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
