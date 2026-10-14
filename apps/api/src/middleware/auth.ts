import type { Request, RequestHandler } from 'express'
import { prisma } from '../db.js'
import type { UserRole, UserStatus } from '../generated/prisma/enums.js'
import { sha256 } from '../lib/crypto.js'
import { forbidden, unauthorized } from '../lib/errors.js'
import { COOKIE } from '../services/session.js'

export interface AuthContext {
  sessionId: string
  userId: string
  personId: string
  email: string
  name: string
  role: UserRole
  isAdmin: boolean
  status: UserStatus
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext
    }
  }
}

// Resolves the session cookie on every request; rejects nothing by itself.
export const loadSession: RequestHandler = async (req, _res, next) => {
  const token = req.cookies?.[COOKIE] as string | undefined
  if (token) {
    const s = await prisma.session.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: { include: { person: true } } },
    })
    if (s && !s.revokedAt && s.expiresAt > new Date() && s.user.status !== 'REMOVED') {
      req.auth = {
        sessionId: s.id,
        userId: s.userId,
        personId: s.user.personId,
        email: s.user.person.email,
        name: s.user.person.displayName,
        role: s.user.role,
        isAdmin: s.user.isAdmin,
        status: s.user.status,
      }
    }
  }
  next()
}

export const requireAuth: RequestHandler = (req, _res, next) => (req.auth ? next() : next(unauthorized()))

export const requireActive: RequestHandler = (req, _res, next) => {
  if (!req.auth) return next(unauthorized())
  if (req.auth.status !== 'ACTIVE') return next(forbidden('Your membership is not active'))
  next()
}

export const requireCore: RequestHandler = (req, _res, next) => {
  if (!req.auth) return next(unauthorized())
  if (req.auth.status !== 'ACTIVE' || req.auth.role !== 'CORE') return next(forbidden('Core members only'))
  next()
}

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!req.auth) return next(unauthorized())
  if (req.auth.status !== 'ACTIVE' || !req.auth.isAdmin) return next(forbidden('Administrators only'))
  next()
}

export function auth(req: Request): AuthContext {
  if (!req.auth) throw unauthorized()
  return req.auth
}
