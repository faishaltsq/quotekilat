import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { getSupabaseClient, readCloudConfig } from './client'
import { translateAuthError } from './authErrors'
import { AuthContext, type AuthContextValue, type AuthStatus } from './authContext'

export function AuthProvider({ children, config = readCloudConfig() }: { children: ReactNode; config?: ReturnType<typeof readCloudConfig> }) {
  const client = useMemo(() => (config ? getSupabaseClient(config) : null), [config])
  const [status, setStatus] = useState<AuthStatus>(config ? 'loading' : 'unavailable')
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    if (!client) return
    let active = true
    void client.auth.getSession().then(({ data }) => {
      if (!active) return
      setUser(data.session?.user ?? null)
      setStatus(data.session ? 'signed-in' : 'signed-out')
    })
    const { data: subscription } = client.auth.onAuthStateChange((_event, session: Session | null) => {
      if (!active) return
      setUser(session?.user ?? null)
      setStatus(session ? 'signed-in' : 'signed-out')
    })
    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [client])

  const signInWithPassword = useCallback(
    async (email: string, password: string) => {
      if (!client) throw new Error('Cloud belum dikonfigurasi.')
      const { error } = await client.auth.signInWithPassword({ email, password })
      if (error) throw new Error(translateAuthError(error.message))
    },
    [client],
  )

  const signUpWithPassword = useCallback(
    async (email: string, password: string, displayName: string) => {
      if (!client) throw new Error('Cloud belum dikonfigurasi.')
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName.slice(0, 80) } },
      })
      if (error) throw new Error(translateAuthError(error.message))
      // With email confirmation on, Supabase returns a user but no session.
      return { needsConfirmation: !data.session }
    },
    [client],
  )

  const signOut = useCallback(async () => {
    if (!client) return
    const { error } = await client.auth.signOut()
    if (error) throw new Error(translateAuthError(error.message))
  }, [client])

  const requestPasswordReset = useCallback(
    async (email: string) => {
      if (!client) throw new Error('Cloud belum dikonfigurasi.')
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) throw new Error(translateAuthError(error.message))
    },
    [client],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      client,
      cloudUnavailable: !config,
      signInWithPassword,
      signUpWithPassword,
      signOut,
      requestPasswordReset,
    }),
    [status, user, client, config, signInWithPassword, signUpWithPassword, signOut, requestPasswordReset],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
