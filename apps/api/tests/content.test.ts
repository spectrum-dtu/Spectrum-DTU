import { beforeEach, describe, expect, it } from 'vitest'
import { Client, emailsTo, loggedIn, prisma, resetDb } from './helpers.js'

beforeEach(resetDb)

async function world() {
  const core1 = await loggedIn('core1@dtu.ac.in', 'Core One', { role: 'CORE' })
  const core2 = await loggedIn('core2@dtu.ac.in', 'Core Two', { role: 'CORE' })
  const alice = await loggedIn('alice@dtu.ac.in', 'Alice')
  const bob = await loggedIn('bob@dtu.ac.in', 'Bob')
  const carol = await loggedIn('carol@dtu.ac.in', 'Carol')
  return { core1, core2, alice, bob, carol }
}
type W = Awaited<ReturnType<typeof world>>

const create = async (c: Client, kind: string, title: string, data: object = {}) =>
  (await c.post('/content', { kind, title, data })).body.id as string

async function publish(w: W, owner: Client, kind: string, title: string, data: object = {}) {
  const id = await create(owner, kind, title, data)
  await owner.post(`/content/${id}/submit`).expect(200)
  await w.core1.post(`/content/${id}/review`, { decision: 'approve' }).expect(200)
  return id
}

describe('projects: drafts and visibility', () => {
  it('keeps drafts off public APIs, hides them from Core, shows them read-only to members', async () => {
    const w = await world()
    const id = await create(w.alice, 'PROJECT', 'Secret Draft')
    const anon = new Client()
    expect((await anon.get('/projects')).body).toEqual([])
    expect((await anon.get(`/projects/${id}`)).status).toBe(404)
    expect((await w.core1.get(`/content/${id}`)).status).toBe(404) // Core sees nothing before submission
    const asBob = await w.bob.get(`/content/${id}`)
    expect(asBob.status).toBe(200)
    expect(asBob.body).toMatchObject({ mode: 'draft', canEdit: false })
    expect((await w.bob.patch(`/content/${id}`, { title: 'hijack' })).status).toBe(403)
    expect((await w.core1.get('/review/queue')).body).toEqual([])
  })

  it('ignores client attempts to set status or unknown fields (mass assignment)', async () => {
    const w = await world()
    const id = await create(w.alice, 'PROJECT', 'Mine')
    await w.alice.patch(`/content/${id}`, { title: 'Mine v2', status: 'PUBLISHED', creatorPersonId: w.bob.u.personId, data: { summary: 'ok', isAdmin: true } }).expect(200)
    const detail = (await w.alice.get(`/content/${id}`)).body
    expect(detail.status).toBe('DRAFT')
    expect(detail.working.data).toEqual({ summary: 'ok' })
    expect((await new Client().get('/projects')).body).toEqual([])
  })

  it('requires only a title', async () => {
    const w = await world()
    expect((await w.alice.post('/content', { kind: 'PROJECT', title: '' })).status).toBe(400)
    expect((await w.alice.post('/content', { kind: 'PROJECT', title: 'Just a title' })).status).toBe(201)
  })
})

describe('projects: collaboration', () => {
  it('invitation accept makes a contributor who can edit; decline does not', async () => {
    const w = await world()
    const id = await create(w.alice, 'PROJECT', 'Collab')
    await w.alice.post(`/content/${id}/invitations`, { personIds: [w.bob.u.personId, w.carol.u.personId] }).expect(201)
    // invitee is notified in-app and by email
    expect(await prisma.notification.count({ where: { userId: w.bob.u.userId, type: 'content.invitation' } })).toBe(1)
    expect((await emailsTo('bob@dtu.ac.in')).some((m) => m.subject.includes('invited you'))).toBe(true)

    const bobInv = (await w.bob.get('/invitations')).body[0]
    const carolInv = (await w.carol.get('/invitations')).body[0]
    await w.bob.post(`/invitations/${bobInv.id}/respond`, { accept: true }).expect(200)
    await w.carol.post(`/invitations/${carolInv.id}/respond`, { accept: false }).expect(200)
    expect((await w.bob.post(`/invitations/${bobInv.id}/respond`, { accept: true })).status).toBe(409) // no double response

    expect((await w.bob.patch(`/content/${id}`, { title: 'Collab by Bob' })).status).toBe(200)
    expect((await w.carol.patch(`/content/${id}`, { title: 'nope' })).status).toBe(403)
    // owner was told about both responses
    expect(await prisma.notification.count({ where: { userId: w.alice.u.userId, type: { startsWith: 'content.invitation_' } } })).toBe(2)
  })

  it('only the owner can invite and only active members can be invited', async () => {
    const w = await world()
    const id = await create(w.alice, 'PROJECT', 'P')
    expect((await w.bob.post(`/content/${id}/invitations`, { personIds: [w.carol.u.personId] })).status).toBe(403)
    expect((await w.alice.post(`/content/${id}/invitations`, { personIds: ['nonexistent'] })).status).toBe(400)
  })

  it('join request: owner is notified and acceptance grants edit rights', async () => {
    const w = await world()
    const id = await create(w.alice, 'PROJECT', 'Open to join')
    await w.bob.post(`/content/${id}/join-requests`, { message: 'I can help' }).expect(201)
    expect(await prisma.notification.count({ where: { userId: w.alice.u.userId, type: 'content.join_request' } })).toBe(1)
    const reqId = (await w.alice.get(`/content/${id}`)).body.joinRequests[0].id
    expect((await w.carol.post(`/join-requests/${reqId}/respond`, { accept: true })).status).toBe(403)
    await w.alice.post(`/join-requests/${reqId}/respond`, { accept: true }).expect(200)
    expect((await w.bob.patch(`/content/${id}`, { title: 'Bob helps' })).status).toBe(200)
  })

  it('Core cannot request to join a draft', async () => {
    const w = await world()
    const id = await create(w.alice, 'PROJECT', 'D')
    expect((await w.core1.post(`/content/${id}/join-requests`, {})).status).toBe(404)
  })

  it('waits for pending invitees before reaching Core', async () => {
    const w = await world()
    const id = await create(w.alice, 'PROJECT', 'Wait')
    await w.alice.post(`/content/${id}/invitations`, { personIds: [w.bob.u.personId] })
    await w.alice.post(`/content/${id}/submit`).expect(200)
    expect((await w.alice.get(`/content/${id}`)).body.status).toBe('AWAITING_CONFIRMATION')
    expect((await w.core1.get('/review/queue')).body).toEqual([])
    const inv = (await w.bob.get('/invitations')).body[0]
    await w.bob.post(`/invitations/${inv.id}/respond`, { accept: true })
    expect((await w.core1.get('/review/queue')).body).toHaveLength(1)
    expect((await w.alice.get(`/content/${id}`)).body.status).toBe('AWAITING_CORE_APPROVAL')
  })
})

describe('projects: review and publication', () => {
  it('submission notifies every Core member in-app and by email; approval publishes', async () => {
    const w = await world()
    const id = await create(w.alice, 'PROJECT', 'Rover', { summary: 'A rover', technologies: ['ESP32'] })
    await w.alice.post(`/content/${id}/submit`).expect(200)
    for (const c of [w.core1, w.core2]) {
      expect(await prisma.notification.count({ where: { userId: c.u.userId, type: 'content.submitted' } })).toBe(1)
    }
    expect((await emailsTo('core2@dtu.ac.in')).some((m) => m.subject.includes('Submitted for review'))).toBe(true)

    expect((await w.bob.post(`/content/${id}/review`, { decision: 'approve' })).status).toBe(403)
    expect((await w.alice.get('/review/queue')).status).toBe(403)
    expect((await new Client().get('/projects')).body).toEqual([])

    await w.core2.post(`/content/${id}/review`, { decision: 'approve' }).expect(200)
    const pub = (await new Client().get('/projects')).body
    expect(pub).toHaveLength(1)
    expect(pub[0]).toMatchObject({ title: 'Rover', summary: 'A rover', technologies: ['ESP32'] })
    expect(pub[0].contributors[0]).toMatchObject({ name: 'Alice', removed: false })
    expect((await w.core1.post(`/content/${id}/review`, { decision: 'approve' })).status).toBe(409) // already reviewed
    expect(await prisma.notification.count({ where: { userId: w.alice.u.userId, type: 'content.approve' } })).toBe(1)
  })

  it('changes-requested returns to an editable state and can be resubmitted', async () => {
    const w = await world()
    const id = await create(w.alice, 'PROJECT', 'Needs work')
    await w.alice.post(`/content/${id}/submit`)
    expect((await w.core1.post(`/content/${id}/review`, { decision: 'changes' })).status).toBe(400) // note required
    await w.core1.post(`/content/${id}/review`, { decision: 'changes', note: 'Add a description' }).expect(200)
    const d = (await w.alice.get(`/content/${id}`)).body
    expect(d).toMatchObject({ status: 'CHANGES_REQUESTED', canEdit: true })
    expect(d.working.reviewNote).toBe('Add a description')
    await w.alice.patch(`/content/${id}`, { data: { description: 'Now described' } }).expect(200)
    await w.alice.post(`/content/${id}/submit`).expect(200)
    await w.core1.post(`/content/${id}/review`, { decision: 'approve' }).expect(200)
    expect((await new Client().get('/projects')).body).toHaveLength(1)
  })

  it('reject sends a first submission back to draft', async () => {
    const w = await world()
    const id = await create(w.alice, 'PROJECT', 'Nope')
    await w.alice.post(`/content/${id}/submit`)
    await w.core1.post(`/content/${id}/review`, { decision: 'reject', note: 'Out of scope' }).expect(200)
    expect((await w.alice.get(`/content/${id}`)).body).toMatchObject({ status: 'DRAFT', canEdit: true })
  })

  it('owner can withdraw a submission', async () => {
    const w = await world()
    const id = await create(w.alice, 'PROJECT', 'Oops')
    await w.alice.post(`/content/${id}/submit`)
    await w.alice.post(`/content/${id}/withdraw`).expect(200)
    expect((await w.core1.get('/review/queue')).body).toEqual([])
    expect((await w.alice.get(`/content/${id}`)).body.canEdit).toBe(true)
  })
})

describe('published edits create revisions', () => {
  it('keeps the live version unchanged until Core approves the revision', async () => {
    const w = await world()
    const id = await publish(w, w.alice, 'PROJECT', 'v1 title', { summary: 'v1' })
    await w.alice.post(`/content/${id}/revise`).expect(201)
    expect((await w.alice.post(`/content/${id}/revise`)).status).toBe(409) // one open revision at a time
    await w.alice.patch(`/content/${id}`, { title: 'v2 title', data: { summary: 'v2' } }).expect(200)

    const anon = new Client()
    expect((await anon.get(`/projects/${id}`)).body.title).toBe('v1 title') // unchanged while editing
    await w.alice.post(`/content/${id}/submit`).expect(200)
    expect((await anon.get(`/projects/${id}`)).body.title).toBe('v1 title') // unchanged while under review
    expect((await w.core1.get('/review/queue')).body[0]).toMatchObject({ isRevision: true })

    await w.core1.post(`/content/${id}/review`, { decision: 'approve' }).expect(200)
    expect((await anon.get(`/projects/${id}`)).body).toMatchObject({ title: 'v2 title', summary: 'v2' })
    const revs = await prisma.contentRevision.findMany({ where: { itemId: id }, orderBy: { number: 'asc' } })
    expect(revs.map((r) => r.state)).toEqual(['SUPERSEDED', 'APPROVED']) // history preserved
  })

  it('a rejected revision leaves the published version as it was', async () => {
    const w = await world()
    const id = await publish(w, w.alice, 'PROJECT', 'Stable')
    await w.alice.post(`/content/${id}/revise`)
    await w.alice.patch(`/content/${id}`, { title: 'Unwanted' })
    await w.alice.post(`/content/${id}/submit`)
    await w.core1.post(`/content/${id}/review`, { decision: 'reject', note: 'No' }).expect(200)
    expect((await new Client().get(`/projects/${id}`)).body.title).toBe('Stable')
    await w.alice.post(`/content/${id}/revise`).expect(201) // can try again
  })

  it('only contributors can revise a published project', async () => {
    const w = await world()
    const id = await publish(w, w.alice, 'PROJECT', 'Pub')
    expect((await w.bob.post(`/content/${id}/revise`)).status).toBe(403)
  })

  it('Core can unpublish, archive and restore', async () => {
    const w = await world()
    const id = await publish(w, w.alice, 'PROJECT', 'Pub')
    expect((await w.alice.post(`/content/${id}/status`, { action: 'unpublish' })).status).toBe(403)
    await w.core1.post(`/content/${id}/status`, { action: 'unpublish' }).expect(200)
    expect((await new Client().get(`/projects/${id}`)).status).toBe(404)
    await w.core1.post(`/content/${id}/status`, { action: 'publish' }).expect(200)
    expect((await new Client().get(`/projects/${id}`)).status).toBe(200)
    await w.core1.post(`/content/${id}/status`, { action: 'archive' }).expect(200)
    expect((await new Client().get('/projects')).body).toEqual([])
    await w.core1.post(`/content/${id}/status`, { action: 'restore' }).expect(200)
  })
})

describe('achievements', () => {
  it('follow the same approval and revision model', async () => {
    const w = await world()
    const id = await create(w.alice, 'ACHIEVEMENT', 'Hackathon Winners', { position: '1st', event: 'SIH' })
    expect((await new Client().get(`/achievements/${id}`)).status).toBe(404)
    await w.alice.post(`/content/${id}/submit`)
    expect((await w.bob.post(`/content/${id}/review`, { decision: 'approve' })).status).toBe(403)
    await w.core1.post(`/content/${id}/review`, { decision: 'approve' }).expect(200)
    expect((await new Client().get(`/achievements/${id}`)).body).toMatchObject({ title: 'Hackathon Winners', position: '1st' })
    await w.alice.post(`/content/${id}/revise`)
    await w.alice.patch(`/content/${id}`, { title: 'Winners (updated)' })
    await w.alice.post(`/content/${id}/submit`)
    expect((await new Client().get(`/achievements/${id}`)).body.title).toBe('Hackathon Winners')
    await w.core1.post(`/content/${id}/review`, { decision: 'approve' })
    expect((await new Client().get(`/achievements/${id}`)).body.title).toBe('Winners (updated)')
  })
})

describe('events', () => {
  it('any member can propose; Core approval publishes; Core is notified', async () => {
    const w = await world()
    const id = await create(w.bob, 'EVENT', 'Workshop', { startsAt: '2027-01-10T10:00:00Z', location: 'Lab' })
    await w.bob.post(`/content/${id}/submit`).expect(200)
    expect(await prisma.notification.count({ where: { type: 'content.submitted' } })).toBe(2)
    expect((await new Client().get('/events')).body).toEqual([])
    await w.core1.post(`/content/${id}/review`, { decision: 'approve' }).expect(200)
    expect((await new Client().get('/events')).body[0]).toMatchObject({ title: 'Workshop', location: 'Lab' })
  })

  it('post-publish edits need Core approval; only Core may delete or unpublish', async () => {
    const w = await world()
    const id = await publish(w, w.bob, 'EVENT', 'Meetup', { location: 'A' })
    expect((await w.alice.post(`/content/${id}/revise`)).status).toBe(403) // not the proposer
    await w.bob.post(`/content/${id}/revise`).expect(201)
    await w.bob.patch(`/content/${id}`, { data: { location: 'B' } })
    expect((await new Client().get(`/events/${id}`)).body.location).toBe('A')
    await w.bob.post(`/content/${id}/submit`)
    expect(await prisma.notification.count({ where: { type: 'content.submitted', userId: w.core1.u.userId } })).toBe(2) // proposal + revision
    await w.core1.post(`/content/${id}/review`, { decision: 'approve' })
    expect((await new Client().get(`/events/${id}`)).body.location).toBe('B')

    expect((await w.bob.delete(`/content/${id}`)).status).toBe(403)
    expect((await w.bob.post(`/content/${id}/status`, { action: 'unpublish' })).status).toBe(403)
    await w.core1.delete(`/content/${id}`).expect(200)
    expect((await new Client().get('/events')).body).toEqual([])
  })

  it('Core can edit a published event, but the revision still needs Core approval to go live', async () => {
    const w = await world()
    const id = await publish(w, w.bob, 'EVENT', 'Talk', { location: 'A' })
    await w.core2.post(`/content/${id}/revise`).expect(201)
    await w.core2.patch(`/content/${id}`, { data: { location: 'Hall' } }).expect(200)
    expect((await new Client().get(`/events/${id}`)).body.location).toBe('A')
    await w.core2.post(`/content/${id}/submit`).expect(200)
    expect((await new Client().get(`/events/${id}`)).body.location).toBe('A') // still unapproved
    await w.core1.post(`/content/${id}/review`, { decision: 'approve' }).expect(200)
    expect((await new Client().get(`/events/${id}`)).body.location).toBe('Hall')
  })

  it('event drafts are private to the proposer', async () => {
    const w = await world()
    const id = await create(w.bob, 'EVENT', 'Private plan')
    expect((await w.alice.get(`/content/${id}`)).status).toBe(404)
    expect((await w.core1.get(`/content/${id}`)).status).toBe(404)
  })
})

describe('events/public data hygiene', () => {
  it('public payloads never include drafts, emails or internal ids of members', async () => {
    const w = await world()
    await publish(w, w.alice, 'PROJECT', 'Public one')
    const body = JSON.stringify((await new Client().get('/projects')).body)
    expect(body).not.toContain('@dtu.ac.in')
    expect(body).not.toContain('passwordHash')
  })
})
