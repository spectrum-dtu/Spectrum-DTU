import type { RequestHandler } from 'express'
import rateLimit from 'express-rate-limit'
import { env } from '../config/env.js'
import { safeEqual } from '../lib/crypto.js'
import { forbidden } from '../lib/errors.js'
import { csrfTokenFor } from '../services/session.js'

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS'])

// CSRF defence for cookie auth:
//  1. a browser-supplied Origin must be an approved origin;
//  2. any authenticated state-changing request must carry the session-bound token.
export const csrfProtect: RequestHandler = (req, _res, next) => {
  if (SAFE.has(req.method)) return next()
  const origin = req.headers.origin
  if (origin && !env.CORS_ORIGINS.includes(origin.toLowerCase())) return next(forbidden('Origin not allowed'))
  if (req.auth) {
    const sent = req.headers['x-csrf-token']
    if (typeof sent !== 'string' || !safeEqual(sent, csrfTokenFor(req.auth.sessionId))) {
      return next(forbidden('Missing or invalid CSRF token'))
    }
  }
  next()
}

const make = (windowMs: number, limit: number, message: string): RequestHandler =>
  env.NODE_ENV === 'test'
    ? (_req, _res, next) => next()
    : rateLimit({ windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: message } })

export const globalLimiter = make(15 * 60_000, 600, 'Too many requests. Please slow down.')
export const authLimiter = make(15 * 60_000, 30, 'Too many attempts. Please try again later.')
export const otpLimiter = make(60 * 60_000, 15, 'Too many code requests. Please try again later.')
export const contactLimiter = make(60 * 60_000, 5, 'Too many messages. Please try again later.')
export const uploadLimiter = make(60 * 60_000, 60, 'Too many uploads. Please try again later.')
