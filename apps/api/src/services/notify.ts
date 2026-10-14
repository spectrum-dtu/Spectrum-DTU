import { webOrigin } from '../config/env.js'
import type { Db } from '../db.js'
import { queueEmail } from './mail.js'

export interface NotifyInput {
  type: string
  title: string
  body?: string
  link?: string // app-relative path, e.g. /dashboard/projects
  // Distinguishes repeat events of the same type so retries never double-send.
  dedupe?: string
}

// Every notification that needs attention also produces an email (via the outbox).
export async function notifyUsers(db: Db, userIds: string[], n: NotifyInput) {
  const ids = [...new Set(userIds)]
  if (!ids.length) return
  const users = await db.user.findMany({
    where: { id: { in: ids }, status: 'ACTIVE' },
    select: { id: true, person: { select: { email: true } } },
  })
  for (const u of users) {
    await db.notification.create({
      data: { userId: u.id, type: n.type, title: n.title, body: n.body, link: n.link },
    })
    const lines = [n.title, n.body, n.link ? `Open: ${webOrigin}${n.link}` : undefined].filter(Boolean)
    await queueEmail(db, {
      to: u.person.email,
      subject: `Spectrum DTU: ${n.title}`,
      text: lines.join('\n\n'),
      dedupeKey: n.dedupe ? `${n.type}:${u.id}:${n.dedupe}` : undefined,
    })
  }
}

export async function coreUserIds(db: Db, exclude: string[] = []): Promise<string[]> {
  const core = await db.user.findMany({
    where: { status: 'ACTIVE', role: 'CORE', id: { notIn: exclude } },
    select: { id: true },
  })
  return core.map((c) => c.id)
}

export async function notifyCore(db: Db, n: NotifyInput, exclude: string[] = []) {
  await notifyUsers(db, await coreUserIds(db, exclude), n)
}

// For people without an active account (applicants): email only.
export async function emailAddress(db: Db, to: string, subject: string, text: string, dedupeKey?: string) {
  await queueEmail(db, { to, subject: `Spectrum DTU: ${subject}`, text, dedupeKey })
}
