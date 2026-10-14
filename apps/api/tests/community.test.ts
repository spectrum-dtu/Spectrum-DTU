import { beforeEach, describe, expect, it } from 'vitest'
import { Client, emailsTo, loggedIn, prisma, resetDb } from './helpers.js'
import { notifyUsers } from '../src/services/notify.js'
import { processOutbox } from '../src/services/mail.js'

beforeEach(resetDb)

describe('Core promotion', () => {
  it('only an admin can promote; promotion moves the team card and grants Core access', async () => {
    const admin = await loggedIn('admin@dtu.ac.in', 'Admin', { role: 'CORE', isAdmin: true })
    const core = await loggedIn('core@dtu.ac.in', 'Plain Core', { role: 'CORE' })
    const member = await loggedIn('mem@dtu.ac.in', 'Mem')
    const other = await loggedIn('other@dtu.ac.in', 'Other')

    expect((await core.post(`/admin/members/${member.u.personId}/promote`)).status).toBe(403) // Core is not enough
    expect((await other.post(`/admin/members/${member.u.personId}/promote`)).status).toBe(403)
    expect((await new Client().post(`/admin/members/${member.u.personId}/promote`)).status).toBe(401)
    expect((await member.get('/review/queue')).status).toBe(403)

    let team = (await new Client().get('/team')).body
    expect(team.members.map((m: { name: string }) => m.name)).toContain('Mem')
    await admin.post(`/admin/members/${member.u.personId}/promote`).expect(200)
    team = (await new Client().get('/team')).body
    expect(team.core.map((m: { name: string }) => m.name)).toContain('Mem')
    expect(team.members.map((m: { name: string }) => m.name)).not.toContain('Mem')

    // Roles are read from the database on every request, so the existing session upgrades immediately.
    expect((await member.get('/review/queue')).status).toBe(200)
    expect(await prisma.notification.count({ where: { userId: member.u.userId, type: 'role.promoted' } })).toBe(1)
    expect((await emailsTo('mem@dtu.ac.in')).some((m) => m.subject.includes('Core team'))).toBe(true)
    expect(await prisma.auditLog.count({ where: { action: 'admin.promote' } })).toBe(1)
    expect((await admin.post(`/admin/members/${member.u.personId}/promote`)).status).toBe(409)
  })
})

describe('profiles and team', () => {
  it('members edit only their own profile', async () => {
    const a = await loggedIn('a@dtu.ac.in', 'Ann')
    const b = await loggedIn('b@dtu.ac.in', 'Ben')
    await a.patch('/me/profile', { bio: 'Ann bio', github: 'https://github.com/ann', domain: 'IoT' }).expect(200)
    // The API has no endpoint addressing another user's profile; extra ids in the body are ignored.
    await a.patch('/me/profile', { userId: b.u.userId, personId: b.u.personId, bio: 'Ann bio 2' }).expect(200)
    const bp = (await new Client().get(`/team/${b.u.personId}`)).body
    expect(bp.bio).toBeUndefined()
    const ap = (await new Client().get(`/team/${a.u.personId}`)).body
    expect(ap).toMatchObject({ name: 'Ann', bio: 'Ann bio 2', github: 'https://github.com/ann', domain: 'IoT' })
    expect(JSON.stringify(ap)).not.toContain('@dtu.ac.in') // emails are never public
  })

  it('rejects unsafe profile links', async () => {
    const a = await loggedIn('a@dtu.ac.in', 'Ann')
    expect((await a.patch('/me/profile', { github: 'javascript:alert(1)' })).status).toBe(400)
  })

  it('splits Core Team and Members, and only lists active accounts', async () => {
    await loggedIn('c@dtu.ac.in', 'Coretta', { role: 'CORE' })
    await loggedIn('m@dtu.ac.in', 'Memo')
    await loggedIn('p@dtu.ac.in', 'Pending', { status: 'PENDING_APPROVAL' }).catch(() => undefined)
    const t = (await new Client().get('/team')).body
    expect(t.core.map((x: { name: string }) => x.name)).toEqual(['Coretta'])
    expect(t.members.map((x: { name: string }) => x.name)).toEqual(['Memo'])
  })
})

describe('notifications', () => {
  it('tracks read state and is isolated per user', async () => {
    const core1 = await loggedIn('c1@dtu.ac.in', 'C1', { role: 'CORE' })
    const core2 = await loggedIn('c2@dtu.ac.in', 'C2', { role: 'CORE' })
    await new Client().post('/contact', { name: 'Visitor', email: 'v@example.com', subject: 'Hello', message: 'A message long enough.' }).expect(202)
    const list = (await core1.get('/notifications')).body
    expect(list.unread).toBe(1)
    const nid = list.items[0].id
    await core2.post(`/notifications/${nid}/read`).expect(200) // someone else's: no effect
    expect((await core1.get('/notifications')).body.unread).toBe(1)
    await core1.post(`/notifications/${nid}/read`).expect(200)
    const after = (await core1.get('/notifications')).body
    expect(after.unread).toBe(0)
    expect(after.items[0].readAt).not.toBeNull()
    expect((await new Client().get('/notifications')).status).toBe(401)
  })
})

describe('contact form', () => {
  const ok = { name: 'Visitor', email: 'v@example.com', subject: 'Sponsorship', message: 'We would like to sponsor an event.' }

  it('stores the message and notifies every Core member in-app and by email', async () => {
    const c1 = await loggedIn('c1@dtu.ac.in', 'C1', { role: 'CORE' })
    const c2 = await loggedIn('c2@dtu.ac.in', 'C2', { role: 'CORE' })
    await loggedIn('m@dtu.ac.in', 'Plain')
    await new Client().post('/contact', ok).expect(202)
    expect(await prisma.contactSubmission.count()).toBe(1)
    for (const c of [c1, c2]) expect(await prisma.notification.count({ where: { userId: c.u.userId, type: 'contact.new' } })).toBe(1)
    expect(await prisma.notification.count({ where: { type: 'contact.new' } })).toBe(2) // members get none
    expect((await emailsTo('c2@dtu.ac.in')).some((m) => m.subject.includes('Sponsorship'))).toBe(true)
  })

  it('validates input and silently drops honeypot submissions', async () => {
    await loggedIn('c1@dtu.ac.in', 'C1', { role: 'CORE' })
    expect((await new Client().post('/contact', { ...ok, email: 'not-an-email' })).status).toBe(400)
    expect((await new Client().post('/contact', { ...ok, message: 'short' })).status).toBe(400)
    await new Client().post('/contact', { ...ok, website: 'http://spam.example' }).expect(202)
    expect(await prisma.contactSubmission.count()).toBe(0)
    expect(await prisma.notification.count()).toBe(0)
  })

  it('only Core can read submissions', async () => {
    const m = await loggedIn('m@dtu.ac.in', 'Plain')
    expect((await m.get('/contact/submissions')).status).toBe(403)
  })
})

describe('email outbox', () => {
  it('delivers pending emails once and marks them sent', async () => {
    const u = await loggedIn('u@dtu.ac.in', 'U')
    await prisma.$transaction((tx) => notifyUsers(tx, [u.u.userId], { type: 'test', title: 'Ping', body: 'x' }))
    expect(await processOutbox()).toBe(1)
    expect(await processOutbox()).toBe(0) // nothing is sent twice
    const row = (await emailsTo('u@dtu.ac.in'))[0]!
    expect(row.status).toBe('SENT')
  })

  it('dedupe keys prevent duplicate emails when an operation is retried', async () => {
    const u = await loggedIn('u@dtu.ac.in', 'U')
    for (let i = 0; i < 3; i++) await prisma.$transaction((tx) => notifyUsers(tx, [u.u.userId], { type: 'retry', title: 'Once', dedupe: 'same-event' }))
    expect((await emailsTo('u@dtu.ac.in')).filter((m) => m.subject.includes('Once'))).toHaveLength(1)
  })

  it('writes the email atomically with the change: a rolled-back transaction sends nothing', async () => {
    const u = await loggedIn('u@dtu.ac.in', 'U')
    await prisma.$transaction(async (tx) => {
      await notifyUsers(tx, [u.u.userId], { type: 'rollback', title: 'Ghost' })
      throw new Error('boom')
    }).catch(() => undefined)
    expect((await emailsTo('u@dtu.ac.in')).filter((m) => m.subject.includes('Ghost'))).toHaveLength(0)
    expect(await prisma.notification.count({ where: { type: 'rollback' } })).toBe(0)
  })
})
