import { Router } from 'express'
import { z } from 'zod'
import { env } from '../config/env.js'
import { prisma } from '../db.js'
import { randomToken, safeEqual, sha256 } from '../lib/crypto.js'
import { badRequest, HttpError, notFound } from '../lib/errors.js'
import { DUMMY_HASH_PROMISE, hashPassword, verifyPassword } from '../lib/password.js'
import { emailAllowed, normalizeEmail, sessionUser } from '../lib/user.js'
import { parse } from '../lib/validate.js'
import { auth, requireAuth } from '../middleware/auth.js'
import { authLimiter, otpLimiter } from '../middleware/security.js'
import { audit } from '../services/audit.js'
import { queueEmail } from '../services/mail.js'
import { issueOtp, verifyOtp } from '../services/otp.js'
import { clearSessionCookie, createSession, csrfTokenFor, revokeAllSessions } from '../services/session.js'

export const authRouter = Router()

const email = z.string().trim().max(254).transform(normalizeEmail).pipe(z.email())
const password = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(128, 'Use at most 128 characters')
const otp = z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code')

const GENERIC_CODE_SENT = { message: 'If the address is eligible, a verification code has been sent.' }
const BAD_CODE = 'Invalid or expired code'

async function sendOtpEmail(to: string, code: string, what: string) {
  await queueEmail(prisma, {
    to,
    subject: `Spectrum DTU: your verification code`,
    text: `Your code to ${what} is ${code}.\n\nIt expires in 10 minutes. If you did not request it, you can ignore this email. We will never ask for your password by email.`,
  })
}

authRouter.post('/auth/register', authLimiter, otpLimiter, async (req, res) => {
  const body = parse(z.object({ email, password }), req.body)
  if (!emailAllowed(body.email)) throw badRequest('Registration is limited to approved DTU email addresses.')
  if (body.password.toLowerCase() === body.email) throw badRequest('Password must not be your email address')
  const passwordHash = await hashPassword(body.password)

  const code = await prisma.$transaction(async (tx) => {
    const person = await tx.person.upsert({
      where: { email: body.email },
      create: { email: body.email, displayName: body.email.split('@')[0]! },
      update: {},
    })
    const user = await tx.user.findUnique({ where: { personId: person.id } })
    if (!user) {
      await tx.user.create({ data: { personId: person.id, passwordHash, status: 'UNVERIFIED' } })
    } else if (['UNVERIFIED', 'VERIFIED', 'REJECTED', 'REMOVED'].includes(user.status)) {
      // Re-applying (including a removed member) restarts the full flow; nothing is restored.
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash, status: 'UNVERIFIED', role: 'MEMBER', isAdmin: false },
      })
      await tx.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } })
    } else {
      return null // ACTIVE or PENDING_APPROVAL: leave untouched, reveal nothing
    }
    return issueOtp(tx, body.email, 'REGISTER')
  })
  if (code) await sendOtpEmail(body.email, code, 'verify your Spectrum DTU registration')
  res.status(202).json(GENERIC_CODE_SENT)
})

authRouter.post('/auth/register/resend', authLimiter, otpLimiter, async (req, res) => {
  const body = parse(z.object({ email }), req.body)
  const user = await prisma.user.findFirst({ where: { person: { email: body.email }, status: 'UNVERIFIED' } })
  if (user) {
    const code = await issueOtp(prisma, body.email, 'REGISTER')
    if (code) await sendOtpEmail(body.email, code, 'verify your Spectrum DTU registration')
  }
  res.status(202).json(GENERIC_CODE_SENT)
})

authRouter.post('/auth/register/verify', authLimiter, async (req, res) => {
  const body = parse(z.object({ email, otp }), req.body)
  if (!(await verifyOtp(body.email, 'REGISTER', body.otp))) throw badRequest(BAD_CODE)
  const user = await prisma.user.findFirst({ where: { person: { email: body.email }, status: 'UNVERIFIED' }, include: { person: true } })
  if (!user) throw badRequest(BAD_CODE)
  await prisma.user.update({ where: { id: user.id }, data: { status: 'VERIFIED' } })
  const session = await createSession(res, user.id, false, req.get('user-agent'))
  res.json({
    user: sessionUser({ sessionId: session.id, userId: user.id, personId: user.personId, email: user.person.email, name: user.person.displayName, role: user.role, isAdmin: false, status: 'VERIFIED' }),
    csrfToken: csrfTokenFor(session.id),
  })
})

authRouter.post('/auth/login', authLimiter, async (req, res) => {
  const body = parse(z.object({ email, password: z.string().min(1).max(128), remember: z.boolean().optional() }), req.body)
  const user = await prisma.user.findFirst({ where: { person: { email: body.email } }, include: { person: true } })
  const ok = await verifyPassword(user?.passwordHash ?? (await DUMMY_HASH_PROMISE), body.password)
  if (!user || !ok || user.status === 'UNVERIFIED' || user.status === 'REMOVED') {
    throw new HttpError(401, 'Invalid email or password')
  }
  if (user.status === 'PENDING_APPROVAL') {
    throw new HttpError(403, 'Your application is awaiting approval by the core team.', 'pending_approval')
  }
  const session = await createSession(res, user.id, body.remember === true, req.get('user-agent'))
  res.json({
    user: sessionUser({ sessionId: session.id, userId: user.id, personId: user.personId, email: user.person.email, name: user.person.displayName, role: user.role, isAdmin: user.isAdmin, status: user.status }),
    csrfToken: csrfTokenFor(session.id),
  })
})

authRouter.get('/auth/me', requireAuth, (req, res) => {
  const a = auth(req)
  res.json({ user: sessionUser(a), csrfToken: csrfTokenFor(a.sessionId) })
})

authRouter.post('/auth/logout', async (req, res) => {
  if (req.auth) await prisma.session.update({ where: { id: req.auth.sessionId }, data: { revokedAt: new Date() } })
  clearSessionCookie(res)
  res.json({ ok: true })
})

// --- Forgot / reset ---------------------------------------------------------

authRouter.post('/auth/forgot', authLimiter, otpLimiter, async (req, res) => {
  const body = parse(z.object({ email }), req.body)
  const user = await prisma.user.findFirst({
    where: { person: { email: body.email }, status: { in: ['ACTIVE', 'VERIFIED', 'REJECTED', 'PENDING_APPROVAL'] } },
  })
  if (user) {
    const code = await issueOtp(prisma, body.email, 'RESET_PASSWORD')
    if (code) await sendOtpEmail(body.email, code, 'reset your Spectrum DTU password')
  }
  res.status(202).json(GENERIC_CODE_SENT)
})

authRouter.post('/auth/forgot/verify', authLimiter, async (req, res) => {
  const body = parse(z.object({ email, otp }), req.body)
  if (!(await verifyOtp(body.email, 'RESET_PASSWORD', body.otp))) throw badRequest(BAD_CODE)
  const user = await prisma.user.findFirst({ where: { person: { email: body.email } } })
  if (!user) throw badRequest(BAD_CODE)
  const token = randomToken(32)
  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
    prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 15 * 60_000) },
    }),
  ])
  res.json({ resetToken: token })
})

authRouter.post('/auth/reset', authLimiter, async (req, res) => {
  const body = parse(z.object({ token: z.string().min(20).max(200), password }), req.body)
  const passwordHash = await hashPassword(body.password)
  const done = await prisma.$transaction(async (tx) => {
    const t = await tx.passwordResetToken.findUnique({ where: { tokenHash: sha256(body.token) } })
    if (!t || t.usedAt || t.expiresAt < new Date()) return false
    // Single use: only one concurrent request can flip usedAt from null.
    const claimed = await tx.passwordResetToken.updateMany({ where: { id: t.id, usedAt: null }, data: { usedAt: new Date() } })
    if (claimed.count !== 1) return false
    await tx.user.update({ where: { id: t.userId }, data: { passwordHash } })
    await tx.session.updateMany({ where: { userId: t.userId, revokedAt: null }, data: { revokedAt: new Date() } })
    await audit(tx, t.userId, 'auth.password_reset', 'User', t.userId)
    return true
  })
  if (!done) throw badRequest('This reset link is invalid or has expired.')
  res.json({ ok: true })
})

// --- Change password (requires OTP to the account email) -------------------

authRouter.post('/auth/change-password/request', requireAuth, otpLimiter, async (req, res) => {
  const a = auth(req)
  const code = await issueOtp(prisma, a.email, 'CHANGE_PASSWORD')
  if (!code) throw new HttpError(429, 'Please wait a minute before requesting another code.')
  await sendOtpEmail(a.email, code, 'change your Spectrum DTU password')
  res.status(202).json({ message: 'A verification code has been sent to your email.' })
})

authRouter.post('/auth/change-password', requireAuth, authLimiter, async (req, res) => {
  const a = auth(req)
  const body = parse(z.object({ otp, password }), req.body)
  if (!(await verifyOtp(a.email, 'CHANGE_PASSWORD', body.otp))) throw badRequest(BAD_CODE)
  const passwordHash = await hashPassword(body.password)
  await prisma.user.update({ where: { id: a.userId }, data: { passwordHash } })
  await revokeAllSessions(a.userId, a.sessionId) // other devices must sign in again
  await audit(prisma, a.userId, 'auth.password_changed', 'User', a.userId)
  res.json({ ok: true })
})

// --- One-time administrator bootstrap --------------------------------------
// Enabled only while BOOTSTRAP_* are set and no admin has been created. After a
// successful call the endpoint answers 404 forever, even if the variables remain.

authRouter.post('/setup/admin', authLimiter, async (req, res) => {
  if (!env.BOOTSTRAP_ADMIN_EMAIL || !env.BOOTSTRAP_TOKEN) throw notFound()
  const done = await prisma.systemFlag.findUnique({ where: { key: 'admin_bootstrapped' } })
  if (done) throw notFound()
  const body = parse(z.object({ token: z.string().min(1).max(200), name: z.string().trim().min(1).max(100), password }), req.body)
  if (!safeEqual(sha256(body.token), sha256(env.BOOTSTRAP_TOKEN))) throw new HttpError(403, 'Invalid setup token')
  const passwordHash = await hashPassword(body.password)
  const adminEmail = normalizeEmail(env.BOOTSTRAP_ADMIN_EMAIL)
  await prisma.$transaction(async (tx) => {
    // Unique primary key makes a concurrent second call fail instead of creating two admins.
    await tx.systemFlag.create({ data: { key: 'admin_bootstrapped', value: new Date().toISOString() } })
    const person = await tx.person.upsert({
      where: { email: adminEmail },
      create: { email: adminEmail, displayName: body.name },
      update: { displayName: body.name, removedAt: null },
    })
    const user = await tx.user.upsert({
      where: { personId: person.id },
      create: { personId: person.id, passwordHash, role: 'CORE', isAdmin: true, status: 'ACTIVE' },
      update: { passwordHash, role: 'CORE', isAdmin: true, status: 'ACTIVE' },
    })
    await tx.profile.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} })
    await audit(tx, user.id, 'admin.bootstrap', 'User', user.id)
  })
  res.status(201).json({ ok: true, message: 'Administrator created. Remove BOOTSTRAP_TOKEN from the environment.' })
})
