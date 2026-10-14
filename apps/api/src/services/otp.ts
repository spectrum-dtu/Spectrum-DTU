import { prisma, type Db } from '../db.js'
import type { OtpPurpose } from '../generated/prisma/enums.js'
import { hmac, randomOtp, safeEqual } from '../lib/crypto.js'

const TTL_MS = 10 * 60_000
const COOLDOWN_MS = 60_000
const MAX_PER_HOUR = 5
const MAX_ATTEMPTS = 5

const hashCode = (email: string, purpose: OtpPurpose, code: string) => hmac(`otp:${email}:${purpose}:${code}`)

// Returns the plaintext code, or null if throttled. Callers must not reveal throttling
// to the requester, otherwise it leaks whether the address is known.
export async function issueOtp(db: Db, email: string, purpose: OtpPurpose): Promise<string | null> {
  const now = Date.now()
  const recent = await db.emailOtp.findMany({
    where: { email, purpose, createdAt: { gt: new Date(now - 3600_000) } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })
  if (recent.length >= MAX_PER_HOUR) return null
  if (recent[0] && now - recent[0].createdAt.getTime() < COOLDOWN_MS) return null
  await db.emailOtp.updateMany({ where: { email, purpose, consumedAt: null }, data: { consumedAt: new Date() } })
  const code = randomOtp()
  await db.emailOtp.create({
    data: { email, purpose, codeHash: hashCode(email, purpose, code), expiresAt: new Date(now + TTL_MS) },
  })
  return code
}

export async function verifyOtp(email: string, purpose: OtpPurpose, code: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const otp = await tx.emailOtp.findFirst({
      where: { email, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    })
    if (!otp) return false
    // Count the attempt first so a wrong guess can never be retried past the limit.
    const bumped = await tx.emailOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } })
    if (bumped.attempts > MAX_ATTEMPTS) {
      await tx.emailOtp.update({ where: { id: otp.id }, data: { consumedAt: new Date() } })
      return false
    }
    if (!safeEqual(otp.codeHash, hashCode(email, purpose, code))) return false
    const used = await tx.emailOtp.updateMany({ where: { id: otp.id, consumedAt: null }, data: { consumedAt: new Date() } })
    return used.count === 1
  })
}
