import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { api, setCsrfToken } from './api'
import type { SessionUser } from './types'

interface AuthState { user: SessionUser | null; loading: boolean }
const AuthContext = createContext<AuthState>({ user: null, loading: true })

// The session lives in an HttpOnly cookie; the client only asks the server who it is
// and keeps the session-bound CSRF token in memory (never in storage).
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true })
  useEffect(() => {
    api<{ user: SessionUser; csrfToken: string }>('/auth/me')
      .then((r) => { setCsrfToken(r.csrfToken); setState({ user: r.user, loading: false }) })
      .catch(() => setState({ user: null, loading: false }))
  }, [])
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext)

export function RequireAuth({ children, core = false, active = true }: { children: ReactNode; core?: boolean; active?: boolean }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <p className="p-12 text-muted" role="status">Checking your session…</p>
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  // Applicants (verified / rejected) can only reach the application form.
  if (active && user.status !== 'ACTIVE') return <Navigate to="/apply" replace />
  if (core && user.role !== 'core') return <Navigate to="/dashboard" replace />
  return <>{children}</>
}
