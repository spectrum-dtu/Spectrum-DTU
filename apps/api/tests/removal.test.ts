import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { app, Client, emailsTo, lastCode, loggedIn, ORIGIN, PASSWORD, prisma, resetDb } from './helpers.js'
import { cannotPass, passes } from '../src/services/removal.js'

beforeEach(resetDb)

async function world(coreCount = 6) {
  const core: Awaited<ReturnType<typeof loggedIn>>[] = []
  for (let i = 1; i <= coreCount; i++) core.push(await loggedIn(`core${i}@dtu.ac.in`, `Core ${i}`, { role: 'CORE' }))
  const target = await loggedIn('target@dtu.ac.in', 'Target Member')
  const friend = await loggedIn('friend@dtu.ac.in', 'Friend')
  return { core, target, friend }
}

const open = async (c: Client, personId: string, reason?: string) => (await c.post('/removals', { personId, reason })).body.id as string
const status = async (id: string) => (await prisma.removalRequest.findUniqueOrThrow({ where: { id } })).status

describe('threshold arithmetic', () => {
  it('requires strictly more than 50% of the electorate', () => {
    expect(passes(3, 6)).toBe(false) // exactly half is NOT enough
    expect(passes(4, 6)).toBe(true)
    expect(passes(2, 4)).toBe(false)
    expect(passes(3, 4)).toBe(true)
    expect(passes(1, 1)).toBe(true)
    expect(passes(2, 5)).toBe(false)
    expect(passes(3, 5)).toBe(true)
    expect(cannotPass(3, 6)).toBe(true) // 3 yes at best -> never more than half
    expect(cannotPass(2, 6)).toBe(false)
  })
})

describe('removal vote', () => {
  it('3 of 6 approvals do not remove; the 4th does', async () => {
    const w = await world(6)
    const id = await open(w.core[0]!, w.target.u.personId, 'Inactive')
    for (let i = 0; i < 3; i++) {
      const r = await w.core[i]!.post(`/removals/${id}/vote`, { approve: true })
      expect(r.body.status).toBe('OPEN')
    }
    expect(await status(id)).toBe('OPEN')
    expect((await prisma.user.findUniqueOrThrow({ where: { id: w.target.u.userId } })).status).toBe('ACTIVE')
    const r = await w.core[3]!.post(`/removals/${id}/vote`, { approve: true })
    expect(r.body.status).toBe('APPROVED')
    expect((await prisma.user.findUniqueOrThrow({ where: { id: w.target.u.userId } })).status).toBe('REMOVED')
  })

  it('closes as rejected once a majority is impossible', async () => {
    const w = await world(6)
    const id = await open(w.core[0]!, w.target.u.personId)
    for (let i = 0; i < 2; i++) await w.core[i]!.post(`/removals/${id}/vote`, { approve: false })
    expect(await status(id)).toBe('OPEN')
    await w.core[2]!.post(`/removals/${id}/vote`, { approve: false })
    expect(await status(id)).toBe('REJECTED')
    expect((await prisma.user.findUniqueOrThrow({ where: { id: w.target.u.userId } })).status).toBe('ACTIVE')
  })

  it('prevents duplicate votes', async () => {
    const w = await world(6)
    const id = await open(w.core[0]!, w.target.u.personId)
    await w.core[1]!.post(`/removals/${id}/vote`, { approve: true }).expect(200)
    expect((await w.core[1]!.post(`/removals/${id}/vote`, { approve: true })).status).toBe(409)
    expect((await w.core[1]!.post(`/removals/${id}/vote`, { approve: false })).status).toBe(409)
    expect(await prisma.removalVote.count({ where: { requestId: id } })).toBe(1)
  })

  it('concurrent votes produce one consistent outcome', async () => {
    const w = await world(6)
    const id = await open(w.core[0]!, w.target.u.personId)
    const results = await Promise.all(w.core.map((c) => c.post(`/removals/${id}/vote`, { approve: true })))
    expect(results.filter((r) => r.status === 200 && r.body.status === 'APPROVED')).toHaveLength(1)
    expect(await status(id)).toBe('APPROVED')
    expect(await prisma.auditLog.count({ where: { action: 'removal.executed' } })).toBe(1)
    const yes = await prisma.removalVote.count({ where: { requestId: id, approve: true } })
    expect(yes).toBeGreaterThanOrEqual(4)
  })

  it('excludes a Core target from the electorate and hides the vote from them', async () => {
    const w = await world(6) // target is core1 -> 5 eligible voters, 3 needed
    const targetCore = w.core[0]!
    const id = await open(w.core[1]!, targetCore.u.personId)
    const req = await prisma.removalRequest.findUniqueOrThrow({ where: { id } })
    expect(req.eligibleCount).toBe(5)
    expect(req.electorate).not.toContain(targetCore.u.userId)
    expect((await targetCore.get('/removals')).body).toEqual([])
    expect((await targetCore.post(`/removals/${id}/vote`, { approve: false })).status).toBe(403)
    for (let i = 1; i <= 3; i++) await w.core[i]!.post(`/removals/${id}/vote`, { approve: true })
    expect(await status(id)).toBe('APPROVED') // 3 of 5 > 50%
  })

  it('only Core can open or vote; non-electorate Core cannot vote', async () => {
    const w = await world(4)
    expect((await w.friend.post('/removals', { personId: w.target.u.personId })).status).toBe(403)
    const id = await open(w.core[0]!, w.target.u.personId)
    expect((await w.friend.post(`/removals/${id}/vote`, { approve: true })).status).toBe(403)
    const latecomer = await loggedIn('late@dtu.ac.in', 'Late Core', { role: 'CORE' }) // promoted after the snapshot
    expect((await latecomer.post(`/removals/${id}/vote`, { approve: true })).status).toBe(403)
  })

  it('rejects self-targeting, admins, and a second open vote for the same member', async () => {
    const w = await world(4)
    await loggedIn('admin@dtu.ac.in', 'Admin', { role: 'CORE', isAdmin: true })
    expect((await w.core[0]!.post('/removals', { personId: w.core[0]!.u.personId })).status).toBe(400)
    const admin = await prisma.person.findUniqueOrThrow({ where: { email: 'admin@dtu.ac.in' } })
    expect((await w.core[0]!.post('/removals', { personId: admin.id })).status).toBe(403)
    await open(w.core[0]!, w.target.u.personId)
    expect((await w.core[1]!.post('/removals', { personId: w.target.u.personId })).status).toBe(409)
  })

  it('never notifies the target and notifies the electorate', async () => {
    const w = await world(6)
    const id = await open(w.core[0]!, w.target.u.personId, 'Reason')
    for (let i = 0; i < 4; i++) await w.core[i]!.post(`/removals/${id}/vote`, { approve: true })
    expect(await prisma.notification.count({ where: { userId: w.target.u.userId } })).toBe(0)
    expect((await emailsTo('target@dtu.ac.in')).filter((m) => /remov/i.test(m.subject + m.text))).toHaveLength(0)
    expect(await prisma.notification.count({ where: { userId: w.core[5]!.u.userId, type: 'removal.opened' } })).toBe(1)
    expect(await prisma.notification.count({ where: { userId: w.core[5]!.u.userId, type: 'removal.approved' } })).toBe(1)
    expect((await emailsTo('core6@dtu.ac.in')).some((m) => m.subject.includes('Removal vote opened'))).toBe(true)
    expect(await prisma.auditLog.count({ where: { action: { startsWith: 'removal.' } } })).toBeGreaterThanOrEqual(2)
  })
})

describe('after removal', () => {
  async function removed() {
    const w = await world(6)
    const id = await w.target.post('/content', { kind: 'PROJECT', title: 'Legacy Project', data: { summary: 's' } })
    const pid = id.body.id as string
    await w.target.patch('/me/profile', { bio: 'Old bio that must disappear' })
    await w.target.post(`/content/${pid}/submit`)
    await w.core[0]!.post(`/content/${pid}/review`, { decision: 'approve' })
    const vote = await open(w.core[0]!, w.target.u.personId)
    for (let i = 0; i < 4; i++) await w.core[i]!.post(`/removals/${vote}/vote`, { approve: true })
    return { ...w, projectId: pid }
  }

  it('revokes sessions and login, and removes the active profile and team card', async () => {
    const w = await removed()
    expect((await w.target.get('/auth/me')).status).toBe(401) // existing session dead
    expect((await new Client().login('target@dtu.ac.in')).status).toBe(401)
    const team = (await new Client().get('/team')).body
    expect([...team.core, ...team.members].some((m: { name: string }) => m.name === 'Target Member')).toBe(false)
    expect(await prisma.profile.count({ where: { userId: w.target.u.userId } })).toBe(0)
  })

  it('keeps history, and the historical name shows only the fixed message', async () => {
    const w = await removed()
    const pub = (await new Client().get(`/projects/${w.projectId}`)).body
    expect(pub.title).toBe('Legacy Project') // history preserved
    expect(pub.contributors[0]).toMatchObject({ name: 'Target Member', removed: true })
    const r = await new Client().get(`/team/${w.target.u.personId}`)
    expect(r.status).toBe(410)
    expect(r.body.error).toBe('This person is no longer a member of the team.')
    expect(JSON.stringify(r.body)).not.toContain('Old bio')
    expect(JSON.stringify(r.body)).not.toMatch(/former/i)
  })

  it('lets the same email re-apply; approval relinks history but restores no old profile', async () => {
    const w = await removed()
    const post = (path: string, body: object) => request(app).post(`/api${path}`).set('Origin', ORIGIN).send(body)
    await post('/auth/register', { email: 'target@dtu.ac.in', password: PASSWORD }).expect(202)
    const me = new Client()
    const v = await me.post('/auth/register/verify', { email: 'target@dtu.ac.in', otp: await lastCode('target@dtu.ac.in') })
    me.csrf = v.body.csrfToken
    // Still not a member until Core approves.
    expect((await new Client().get(`/team/${w.target.u.personId}`)).status).toBe(410)
    await me.post('/membership/applications', { name: 'Target Member', branch: 'ME', year: '1' }).expect(201)
    const apps = await w.core[0]!.get('/membership/applications')
    await w.core[1]!.post(`/membership/applications/${apps.body[0].id}/approve`).expect(200)

    const again = new Client()
    const login = await again.login('target@dtu.ac.in')
    expect(login.status).toBe(200)
    expect(login.body.user.personId).toBe(w.target.u.personId) // same stable identity
    const profile = await new Client().get(`/team/${w.target.u.personId}`)
    expect(profile.status).toBe(200)
    expect(profile.body.bio).toBeUndefined() // old profile NOT restored
    expect(profile.body.projects.map((p: { title: string }) => p.title)).toContain('Legacy Project') // history reattached
    expect(login.body.user.role).toBe('member')
  })
})
