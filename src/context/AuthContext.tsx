import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/services/firebase'
import * as profiles from '@/services/profiles'
import type { Profile } from '@/types'

interface AuthContextValue {
  user: Profile | null
  /** true tant que Firebase n'a pas restauré la session au chargement */
  loading: boolean
  login: (email: string, password: string) => Promise<Profile>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(
    () =>
      onAuthStateChanged(auth, async (firebaseUser) => {
        setUser(firebaseUser ? await profiles.loadProfile(firebaseUser).catch(() => null) : null)
        setLoading(false)
      }),
    [],
  )

  const login = async (email: string, password: string) => {
    const profile = await profiles.login(email, password)
    setUser(profile)
    return profile
  }

  const logout = async () => {
    await profiles.logout()
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside an AuthProvider')
  return ctx
}
