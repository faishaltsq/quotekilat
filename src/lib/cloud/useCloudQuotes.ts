import { useCallback, useEffect, useMemo, useState } from 'react'
import { CloudError, fetchRemainingQuota, listCloudQuotes, saveQuoteToCloud, updateCloudQuoteStatus } from './quotesApi'
import { useAuth } from './authContext'
import { toSaveQuotePayload, type CloudQuote, type SaveQuoteSource } from './quoteMapping'

/** Stable per-attempt key so a double click cannot create two cloud rows. */
export function newIdempotencyKey(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export type CloudQuotesState = {
  quotes: CloudQuote[]
  remaining: number | null
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  save: (source: SaveQuoteSource, key: string) => Promise<CloudQuote>
  setStatus: (id: string, status: CloudQuote['status']) => Promise<void>
}

export function useCloudQuotes(): CloudQuotesState {
  const { client, status } = useAuth()
  const signedIn = status === 'signed-in'
  const [quotes, setQuotes] = useState<CloudQuote[]>([])
  const [remaining, setRemaining] = useState<number | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // No setState runs before the first await: calling setState synchronously from
  // an effect body cascades renders, so "loading" is derived from `loaded` instead.
  const reload = useCallback(async () => {
    if (!client || !signedIn) return
    try {
      const [rows, quota] = await Promise.all([listCloudQuotes(client, { limit: 50 }), fetchRemainingQuota(client)])
      setQuotes(rows)
      setRemaining(quota)
      setError(null)
    } catch (cause) {
      setError(cause instanceof CloudError ? cause.message : 'Gagal memuat penawaran cloud.')
    } finally {
      setLoaded(true)
    }
  }, [client, signedIn])

  // Fetch only once a session exists. Every setState here runs inside a promise
  // callback, never synchronously in the effect body, so no cascading render.
  // The signed-out view derives its empty state in the returned value below.
  useEffect(() => {
    if (!signedIn || !client) return
    let cancelled = false
    void Promise.all([listCloudQuotes(client, { limit: 50 }), fetchRemainingQuota(client)])
      .then(([rows, quota]) => {
        if (cancelled) return
        setQuotes(rows)
        setRemaining(quota)
        setError(null)
        setLoaded(true)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setError(cause instanceof CloudError ? cause.message : 'Gagal memuat penawaran cloud.')
        setLoaded(true)
      })
    return () => { cancelled = true }
  }, [signedIn, client])

  const save = useCallback(
    async (source: SaveQuoteSource, key: string) => {
      if (!client) throw new CloudError('AUTH_REQUIRED', 'Cloud belum dikonfigurasi.')
      const payload = toSaveQuotePayload(source, key)
      const row = await saveQuoteToCloud(client, payload)
      setQuotes((current) => [row, ...current.filter((item) => item.id !== row.id)])
      setRemaining((current) => (current === null ? null : Math.max(current - 1, 0)))
      return row
    },
    [client],
  )

  const setStatus = useCallback(
    async (id: string, next: CloudQuote['status']) => {
      if (!client) return
      await updateCloudQuoteStatus(client, id, next)
      setQuotes((current) => current.map((item) => (item.id === id ? { ...item, status: next } : item)))
    },
    [client],
  )

  return useMemo(
    () => ({
      quotes: signedIn ? quotes : [],
      remaining: signedIn ? remaining : null,
      loading: signedIn && !loaded && !error,
      error: signedIn ? error : null,
      reload,
      save,
      setStatus,
    }),
    [signedIn, quotes, remaining, loaded, error, reload, save, setStatus],
  )
}
