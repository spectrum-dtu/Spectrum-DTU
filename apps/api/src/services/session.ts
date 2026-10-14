import type { CookieOptions, Response } from 'express'
import { env, isProd } from '../config/env.js'
import { prisma } from '../db.js'
import { hmac, randomToken, sha256 } from '../lib/crypto.js'

export const COOKIE = 'sid'
const REMEMBER_MS = 7 * 24 * 3600_000
const SHORT_MS = 12 * 3600_000

const cookieBase = (): CookieOptions => ({
  httpOnly: true,
  secure: isProd || env.COOKIE_SAMESITE === 'none',
  sameSite: env.COOKIE_SAMESITE,
  path: '/',
})

export async function createSession(res: Response, userId: string, remember: boolean, userAgent?: string) {
  const token = randomToken(32)
  const ttl = remember ? REMEMBER_MS : SHORT_MS
  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      remember,
      expiresAt: new Date(Date.now() + ttl),
      userAgent: userAgent?.slice(0, 200),
    },
  })
  // Non-remembered sessions use a browser-session cookie (no maxAge).
  res.cookie(COOKIE, token, remember ? { ...cookieBase(), maxAge: ttl } : cookieBase())
  return session
}

export const clearSessionCookie = (res: Response) => res.clearCookie(COOKIE, cookieBase())

export const revokeAllSessions = (userId: string, exceptSessionId?: string) =>
  prisma.session.updateMany({
    where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    data: { revokedAt: new Date() },
  })

// The CSRF token is bound to the session id, so it cannot be forged or reused across sessions.
export const csrfTokenFor = (sessionId: string) => hmac(`csrf:${sessionId}`)
