import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { CloudSavePanel } from '../../src/components/cloud/CloudSavePanel'
import { AuthContext, type AuthContextValue } from '../../src/lib/cloud/authContext'
import type { SaveQuoteSource } from '../../src/lib/cloud/quoteMapping'
import { CloudError } from '../../src/lib/cloud/quotesApi'

const source: SaveQuoteSource = {
  details: { title: 'Hampers custom', customerName: 'Budi' },
  mode: 'goods',
  quantity: 1,
  targetMarginBps: 3000,
  pricing: {
    baseCost: 175000,
    minimumPrice: 250000,
    roundedPrice: 250000,
    discountAmount: 0,
    finalPrice: 250000,
    sellingFees: 0,
    profit: 75000,
    actualMarginBps: 3000,
    belowTarget: false,
    unitPrice: 250000,
    costLines: [],
  },
}

const save = vi.fn()
const setStatus = vi.fn()
const signOut = vi.fn()

vi.mock('../../src/lib/billing/useBilling', () => ({
  useBilling: () => ({ status: null, loading: false, error: null, reload: () => {} }),
}))

vi.mock('../../src/lib/cloud/useCloudQuotes', async () => {
  const actual = await vi.importActual<typeof import('../../src/lib/cloud/useCloudQuotes')>(
    '../../src/lib/cloud/useCloudQuotes',
  )
  return {
    ...actual,
    useCloudQuotes: () => ({
      quotes: [],
      remaining: 4,
      loading: false,
      error: null,
      reload: vi.fn(),
      save,
      setStatus,
    }),
  }
})

function authValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    status: 'signed-in',
    user: { id: 'u1', email: 'a@example.test' } as AuthContextValue['user'],
    client: {} as AuthContextValue['client'],
    cloudUnavailable: false,
    signInWithPassword: vi.fn(),
    signUpWithPassword: vi.fn(),
    signOut,
    requestPasswordReset: vi.fn(),
    ...overrides,
  }
}

const wrap = (value: AuthContextValue) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  }

beforeEach(() => { save.mockReset(); setStatus.mockReset(); signOut.mockReset() })

describe('CloudSavePanel', () => {
  it('renders nothing when the deployment has no cloud config', () => {
    const { container } = render(
      <AuthContext.Provider value={authValue({ status: 'unavailable', client: null, cloudUnavailable: true })}>
        <CloudSavePanel source={source} />
      </AuthContext.Provider>,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('offers sign-in instead of saving when signed out, and never calls save', async () => {
    render(<CloudSavePanel source={source} />, { wrapper: wrap(authValue({ status: 'signed-out', user: null })) })
    const button = screen.getByRole('button', { name: /Masuk & simpan/i })
    await userEvent.click(button)
    expect(save).not.toHaveBeenCalled()
    // The auth dialog opens with the reason, not a redirect.
    expect(await screen.findByRole('dialog')).toBeVisible()
    expect(screen.getByText(/Masuk hanya diperlukan untuk menyimpan ke cloud/i)).toBeVisible()
  })

  it('saves with the pending key once the user is signed in', async () => {
    save.mockResolvedValue({ id: 'q1' })
    render(<CloudSavePanel source={source} />, { wrapper: wrap(authValue()) })
    await userEvent.click(screen.getByRole('button', { name: /Simpan ke cloud/i }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(save.mock.calls[0][0]).toBe(source)
    expect(save.mock.calls[0][1]).toMatch(/^[0-9a-f-]{36}$/i)
    expect(await screen.findByText(/Penawaran tersimpan di cloud/i)).toBeVisible()
  })

  it('explains an exhausted quota and points at the local copy', async () => {
    save.mockRejectedValue(new CloudError('QUOTA_EXCEEDED', 'Kuota penyimpanan cloud bulan ini sudah habis.'))
    render(<CloudSavePanel source={source} />, { wrapper: wrap(authValue()) })
    await userEvent.click(screen.getByRole('button', { name: /Simpan ke cloud/i }))
    expect(await screen.findByText(/Kuota 5 penawaran bulan ini sudah habis/i)).toBeVisible()
    expect(screen.getByText(/Data tetap aman di perangkat ini/i)).toBeVisible()
  })

  it('reopens auth rather than silently failing when the session expired', async () => {
    save.mockRejectedValue(new CloudError('AUTH_REQUIRED', 'Masuk dulu untuk menyimpan ke cloud.'))
    render(<CloudSavePanel source={source} />, { wrapper: wrap(authValue()) })
    await userEvent.click(screen.getByRole('button', { name: /Simpan ke cloud/i }))
    expect(await screen.findByRole('dialog')).toBeVisible()
  })

  it('disables saving while the quote cannot be calculated', () => {
    render(<CloudSavePanel source={null} disabledReason="Lengkapi input" />, { wrapper: wrap(authValue()) })
    expect(screen.getByRole('button', { name: /Simpan ke cloud/i })).toBeDisabled()
  })

  it('shows the remaining quota and the signed-in email', () => {
    render(<CloudSavePanel source={source} />, { wrapper: wrap(authValue()) })
    expect(screen.getByText('a@example.test')).toBeVisible()
    expect(screen.getByText(/Sisa kuota bulan ini: 4 dari 5/i)).toBeVisible()
  })
})
