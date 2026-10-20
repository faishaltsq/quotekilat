import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HeroCopy } from './HeroCopy'

describe('HeroCopy', () => {
  it('leads directly to the guest builder without a signup route', () => {
    render(<HeroCopy />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Harga yang tepat, penawaran lebih cepat.',
    )
    expect(screen.getByRole('link', { name: 'Coba hitung sekarang' })).toHaveAttribute(
      'href',
      '#quote-builder',
    )
    expect(screen.getByText(/Gratis.*Tanpa daftar/)).toBeVisible()
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.queryByRole('link', { name: /daftar|masuk/i })).not.toBeInTheDocument()
  })
})
