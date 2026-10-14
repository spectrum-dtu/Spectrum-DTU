import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { env } from '../config/env.js'

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
export const hmac = (msg: string) => createHmac('sha256', env.SESSION_SECRET).update(msg).digest('hex')
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url')
export const randomOtp = () => String(randomInt(0, 1_000_000)).padStart(6, '0')

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}
