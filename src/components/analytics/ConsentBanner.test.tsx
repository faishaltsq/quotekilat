import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConsentBanner } from './ConsentBanner'
import { CONSENT_KEY } from '../../lib/analytics/consent'

describe('ConsentBanner', () => {
  afterEach(() => localStorage.clear())

  it('shows the choice when nothing is stored', () => {
    render(<ConsentBanner />)
    expect(screen.getByRole('region', { name: 'Pilihan analitik' })).toBeVisible()
  })

  it('stores the decision and disappears', async () => {
    const user = userEvent.setup()
    render(<ConsentBanner />)
    await user.click(screen.getByRole('button', { name: 'Tidak' }))
    expect(localStorage.getItem(CONSENT_KEY)).toBe('denied')
    expect(screen.queryByRole('region', { name: 'Pilihan analitik' })).toBeNull()
  })

  it('stays hidden once a decision exists', () => {
    localStorage.setItem(CONSENT_KEY, 'granted')
    render(<ConsentBanner />)
    expect(screen.queryByRole('region', { name: 'Pilihan analitik' })).toBeNull()
  })
})
