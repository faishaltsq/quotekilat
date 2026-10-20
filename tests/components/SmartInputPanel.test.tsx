import { afterEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FormProvider, useForm, useWatch } from 'react-hook-form'
import { SmartInputPanel } from '../../src/components/ai/SmartInputPanel'
import { AuthContext, type AuthContextValue } from '../../src/lib/cloud/authContext'
import { blankValues, type QuoteFormValues } from '../../src/features/quotation/defaults'

const PARSE = {
  mock: false,
  mode: 'goods',
  fields: { title: 'Hampers', unitCost: 60000 },
  assumptions: ['Kemasan dihitung per unit'],
  missing: ['Ongkir'],
  deadline: null,
  redactedCount: 1,
  remaining: 1,
}

const authValue = (status: AuthContextValue['status']): AuthContextValue => ({
  status,
  user: status === 'signed-in' ? ({ id: 'u1' } as AuthContextValue['user']) : null,
  client: { auth: { getSession: async () => ({ data: { session: { access_token: 'jwt' } } }) } } as unknown as AuthContextValue['client'],
  cloudUnavailable: false,
  signInWithPassword: vi.fn(),
  signUpWithPassword: vi.fn(),
  signOut: vi.fn(),
  requestPasswordReset: vi.fn(),
})

function Harness({ status, onApplied = vi.fn() }: { status: AuthContextValue['status']; onApplied?: () => void }) {
  const form = useForm<QuoteFormValues>({ defaultValues: blankValues() })
  const values = useWatch({ control: form.control }) as QuoteFormValues
  const [, force] = useState(0)
  return (
    <AuthContext.Provider value={authValue(status)}>
      <FormProvider {...form}>
        <SmartInputPanel onApplied={() => { onApplied(); force((n) => n + 1) }} />
        <output data-testid="unitCost">{values.unitCost}</output>
        <output data-testid="title">{values.goodsTitle}</output>
      </FormProvider>
    </AuthContext.Provider>
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('SmartInputPanel', () => {
  it('sends nothing before the user asks', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<Harness status="signed-in" />)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps the button disabled until text and consent are both present', async () => {
    const user = userEvent.setup()
    render(<Harness status="signed-in" />)
    const button = screen.getByRole('button', { name: /isi otomatis/i })
    expect(button).toBeDisabled()
    await user.type(screen.getByLabelText(/catatan pesanan/i), 'Hampers 25 pcs kain 60rb')
    expect(button).toBeDisabled()
    await user.click(screen.getByLabelText(/kirim catatan ini/i))
    expect(button).toBeEnabled()
  })

  it('shows the diff and writes only confirmed fields', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(PARSE), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const applied = vi.fn()
    render(<Harness status="signed-in" onApplied={applied} />)

    await user.type(screen.getByLabelText(/catatan pesanan/i), 'Hampers 25 pcs kain 60rb')
    await user.click(screen.getByLabelText(/kirim catatan ini/i))
    await user.click(screen.getByRole('button', { name: /isi otomatis/i }))

    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument())
    expect(screen.getByTestId('unitCost')).toHaveTextContent('0')

    // unitCost already holds "0", so it arrives unticked; the user opts in.
    await user.click(screen.getByLabelText('Biaya utama / unit'))
    await user.click(screen.getByRole('button', { name: /terapkan 2 isian/i }))
    expect(screen.getByTestId('unitCost')).toHaveTextContent('60000')
    expect(screen.getByTestId('title')).toHaveTextContent('Hampers')
    expect(applied).toHaveBeenCalled()
  })

  it('opens the auth dialog instead of calling the API while signed out', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<Harness status="signed-out" />)
    await user.type(screen.getByLabelText(/catatan pesanan/i), 'Hampers 25 pcs kain 60rb')
    await user.click(screen.getByLabelText(/kirim catatan ini/i))
    await user.click(screen.getByRole('button', { name: /masuk & isi otomatis/i }))
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows the refusal message from the server', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code: 'quota', message: 'Kuota Smart Input bulan ini sudah habis.' } }), { status: 409 })))
    render(<Harness status="signed-in" />)
    await user.type(screen.getByLabelText(/catatan pesanan/i), 'Hampers 25 pcs')
    await user.click(screen.getByLabelText(/kirim catatan ini/i))
    await user.click(screen.getByRole('button', { name: /isi otomatis/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Kuota Smart Input bulan ini sudah habis.'))
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('labels a mock answer and offers nothing to apply', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ...PARSE, mock: true, fields: {}, mode: null, remaining: null }), { status: 200 })))
    render(<Harness status="signed-in" />)
    await user.type(screen.getByLabelText(/catatan pesanan/i), 'Hampers 25 pcs')
    await user.click(screen.getByLabelText(/kirim catatan ini/i))
    await user.click(screen.getByRole('button', { name: /isi otomatis/i }))
    await waitFor(() => expect(screen.getByText(/contoh ai \(belum aktif\)/i)).toBeInTheDocument())
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByText(/tidak ada angka yang diisi otomatis/i)).toBeInTheDocument()
  })
})
