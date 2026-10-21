import { useCallback, useContext, useEffect, useState } from 'react'
import { AuthContext } from '../cloud/authContext'
import { fetchBillingStatus, type BillingStatus } from './client'

export type BillingState = {
  status: BillingStatus | null
  loading: boolean
  error: string | null
  reload: () => void
}

/** The plan lives on the server. This hook only mirrors it for rendering. */
export function useBilling(): BillingState {
  // Read the context directly: the pricing page mounts this outside an
  // AuthProvider, where useAuth() would throw instead of rendering a guest state.
  const auth = useContext(AuthContext)
  const client = auth?.client ?? null
  const signedIn = auth?.status === 'signed-in'
  const [state, setState] = useState<BillingStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!signedIn || !client) return
    let cancelled = false
    void client.auth.getSession().then(async ({ data }) => {
      const token = data.session?.access_token
      if (!token) return
      const result = await fetchBillingStatus({ token })
      if (cancelled) return
      if (result.ok) {
        setState(result.status)
        setError(null)
      } else {
        setError(result.message)
      }
      setLoaded(true)
    })
    return () => { cancelled = true }
  }, [signedIn, client, nonce])

  const reload = useCallback(() => setNonce((value) => value + 1), [])

  return {
    status: signedIn ? state : null,
    loading: signedIn && !loaded && !error,
    error: signedIn ? error : null,
    reload,
  }
}
