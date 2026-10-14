import request from 'supertest'
import { createApp } from '../src/app.js'
import { prisma } from '../src/db.js'
import { hashPassword } from '../src/lib/password.js'
import { processOutbox } from '../src/services/mail.js'

export const app = createApp()
export const ORIGIN = 'http://localhost:5173'
export const PASSWORD = 'correct-horse-battery'

export async function resetDb() {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  const list = rows.map((r) => `"${r.tablename}"`).join(', ')
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`)
}

// A browser-like client: keeps the cookie jar, sends Origin, and attaches the CSRF token.
export class Client {
  agent = request.agent(app)
  csrf: string | null = null
  userId?: string
  personId?: string

  private req(method: 'get' | 'post' | 'patch' | 'put' | 'delete', path: string, body?: unknown) {
    let r = this.agent[method](`/api${path}`).set('Origin', ORIGIN)
    if (this.csrf) r = r.set('X-CSRF-Token', this.csrf)
    return body === undefined ? r : r.send(body as object)
  }
  get = (p: string) => this.req('get', p)
  post = (p: string, b: unknown = {}) => this.req('post', p, b)
  patch = (p: string, b: unknown = {}) => this.req('patch', p, b)
  put = (p: string, b: unknown = {}) => this.req('put', p, b)
  delete = (p: string) => this.req('delete', p)

  async login(email: string, password = PASSWORD, remember = false) {
    const r = await this.post('/auth/login', { email, password, remember })
    if (r.status === 200) {
      this.csrf = r.body.csrfToken
      this.userId = r.body.user.id
      this.personId = r.body.user.personId
    }
    return r
  }
}

export interface SeedOpts { role?: 'MEMBER' | 'CORE'; isAdmin?: boolean; status?: 'ACTIVE' | 'VERIFIED' | 'PENDING_APPROVAL' }

// Inserts an account directly (fast path for tests that are not about registration).
export async function seedUser(email: string, name: string, o: SeedOpts = {}) {
  const person = await prisma.person.upsert({ where: { email }, create: { email, displayName: name }, update: { displayName: name, removedAt: null } })
  const user = await prisma.user.upsert({
    where: { personId: person.id },
    create: { personId: person.id, passwordHash: await hashPassword(PASSWORD), role: o.role ?? 'MEMBER', isAdmin: o.isAdmin ?? false, status: o.status ?? 'ACTIVE' },
    update: { passwordHash: await hashPassword(PASSWORD), role: o.role ?? 'MEMBER', isAdmin: o.isAdmin ?? false, status: o.status ?? 'ACTIVE' },
  })
  if ((o.status ?? 'ACTIVE') === 'ACTIVE') await prisma.profile.upsert({ where: { userId: user.id }, create: { userId: user.id, branch: 'ECE', year: '3' }, update: {} })
  return { userId: user.id, personId: person.id, email }
}

export async function loggedIn(email: string, name: string, o: SeedOpts = {}) {
  const u = await seedUser(email, name, o)
  const c = new Client()
  const r = await c.login(email)
  if (r.status !== 200) throw new Error(`login failed for ${email}: ${r.status}`)
  return Object.assign(c, { u })
}

export const emailsTo = (to: string) => prisma.emailOutbox.findMany({ where: { toEmail: to }, orderBy: { createdAt: 'asc' } })

export async function lastCode(to: string): Promise<string> {
  const rows = await emailsTo(to)
  for (const m of rows.reverse()) {
    const hit = /code[^.]* is (\d{6})/.exec(m.text)
    if (hit) return hit[1]!
  }
  throw new Error(`no code email for ${to}`)
}

export { prisma, processOutbox }
