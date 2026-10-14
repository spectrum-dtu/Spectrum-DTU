import { env } from '../config/env.js'
import type { AuthContext } from '../middleware/auth.js'

export const normalizeEmail = (e: string) => e.trim().toLowerCase()

// Configurable policy: exact domain or any subdomain of an approved domain.
export function emailAllowed(email: string): boolean {
  const domain = email.split('@')[1]
  if (!domain) return false
  return env.ALLOWED_EMAIL_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))
}

export const sessionUser = (a: AuthContext) => ({
  id: a.userId,
  personId: a.personId,
  name: a.name,
  email: a.email,
  role: a.role === 'CORE' ? ('core' as const) : ('member' as const),
  isAdmin: a.isAdmin,
  status: a.status,
})
