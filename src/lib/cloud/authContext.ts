import { createContext, useContext } from 'react'
import type { SupabaseClient, User } from '@supabase/supabase-js'

export type AuthStatus = 'unavailable' | 'loading' | 'signed-out' | 'signed-in'

export type AuthContextValue = {
  status: AuthStatus
  user: User | null
  client: SupabaseClient | null
  /** True when the deployment has no Supabase config, so cloud UI must stay hidden. */
  cloudUnavailable: boolean
  signInWithPassword: (email: string, password: string) => Promise<void>
  signUpWithPassword: (email: string, password: string, displayName: string) => Promise<{ needsConfirmation: boolean }>
  signOut: () => Promise<void>
  requestPasswordReset: (email: string) => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
