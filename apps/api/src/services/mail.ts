import nodemailer, { type Transporter } from 'nodemailer'
import { env, isProd, smtpConfigured } from '../config/env.js'
import { prisma, type Db } from '../db.js'

const MAX_ATTEMPTS = 6
const LEASE_MS = 5 * 60_000

let transport: Transporter | null = null
function getTransport(): Transporter {
  if (transport) return transport
  transport = smtpConfigured
    ? nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      })
    : nodemailer.createTransport({ jsonTransport: true }) // dev/test: nothing leaves the machine
  return transport
}

export interface EmailInput {
  to: string
  subject: string
  text: string
  dedupeKey?: string
}

// Written inside the caller's transaction so an email exists iff the change committed.
export async function queueEmail(db: Db, e: EmailInput) {
  if (e.dedupeKey) {
    await db.emailOutbox.upsert({
      where: { dedupeKey: e.dedupeKey },
      create: { toEmail: e.to, subject: e.subject, text: e.text, dedupeKey: e.dedupeKey },
      update: {},
    })
    return
  }
  await db.emailOutbox.create({ data: { toEmail: e.to, subject: e.subject, text: e.text } })
}

const backoff = (attempt: number) => Math.min(60, 2 ** attempt) * 60_000 // 2m, 4m, ... capped at 1h

interface Claimed { id: string; toEmail: string; subject: string; text: string; attempts: number }

// Claims due rows with a lease (SKIP LOCKED) so concurrent workers never send the same row.
export async function processOutbox(limit = 10): Promise<number> {
  const claimed = await prisma.$queryRaw<Claimed[]>`
    UPDATE "EmailOutbox" SET "nextAttemptAt" = now() + make_interval(secs => ${LEASE_MS / 1000})
    WHERE id IN (
      SELECT id FROM "EmailOutbox"
      WHERE status = 'PENDING' AND "nextAttemptAt" <= now()
      ORDER BY "createdAt" LIMIT ${limit} FOR UPDATE SKIP LOCKED)
    RETURNING id, "toEmail", subject, text, attempts`
  for (const row of claimed) {
    try {
      await getTransport().sendMail({ from: env.MAIL_FROM, to: row.toEmail, subject: row.subject, text: row.text })
      if (!smtpConfigured && !isProd && env.NODE_ENV !== 'test') {
        console.log(`[mail:dev] to=${row.toEmail} subject="${row.subject}"\n${row.text}\n`)
      }
      await prisma.emailOutbox.update({ where: { id: row.id }, data: { status: 'SENT', sentAt: new Date(), lastError: null } })
    } catch (err) {
      const attempts = row.attempts + 1
      await prisma.emailOutbox.update({
        where: { id: row.id },
        data: {
          attempts,
          status: attempts >= MAX_ATTEMPTS ? 'FAILED' : 'PENDING',
          nextAttemptAt: new Date(Date.now() + backoff(attempts)),
          lastError: String((err as Error).message).slice(0, 300),
        },
      })
    }
  }
  return claimed.length
}

export function startOutboxWorker() {
  if (env.NODE_ENV === 'test') return
  const timer = setInterval(() => {
    processOutbox().catch((e) => console.error('outbox worker error:', (e as Error).message))
  }, 5000)
  timer.unref()
}
