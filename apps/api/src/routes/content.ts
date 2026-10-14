import { Router } from 'express'
import { z } from 'zod'
import type { ContentKind } from '../generated/prisma/enums.js'
import { prisma } from '../db.js'
import { badRequest } from '../lib/errors.js'
import { parse } from '../lib/validate.js'
import { auth, requireActive, requireCore } from '../middleware/auth.js'
import {
  createItem, getPublished, inviteMembers, itemDetail, listBrowsableDrafts, listMine, listPublished, loadItem,
  pendingInvitations, requestToJoin, respondInvitation, respondJoinRequest, reviewItem, reviewQueue, setContribution,
  setStatus, startRevision, submitItem, titleSchema, updateWorkingRevision, withdrawItem, KIND_PATH,
} from '../services/content.js'

export const contentRouter = Router()

const kindSchema = z.enum(['PROJECT', 'ACHIEVEMENT', 'EVENT'])
const idParam = (v: unknown) => parse(z.string().min(1).max(40), v)

// ---------------- public (published, approved content only)
const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  featured: z.enum(['true', 'false']).optional(),
})
for (const kind of Object.keys(KIND_PATH) as ContentKind[]) {
  const path = KIND_PATH[kind]
  contentRouter.get(`/${path}`, async (req, res) => {
    const q = parse(listQuery, req.query)
    res.json(await listPublished(kind, { limit: q.limit, featured: q.featured === 'true' }))
  })
  contentRouter.get(`/${path}/:id`, async (req, res) => {
    res.json(await getPublished(kind, idParam(req.params.id)))
  })
}

// ---------------- members
contentRouter.post('/content', requireActive, async (req, res) => {
  const a = auth(req)
  const body = parse(z.object({ kind: kindSchema, title: titleSchema, data: z.unknown().optional() }), req.body)
  res.status(201).json({ id: await createItem(a, body.kind, body.title, body.data) })
})

contentRouter.get('/content/mine', requireActive, async (req, res) => {
  const kind = parse(kindSchema.optional(), req.query.kind)
  res.json(await listMine(auth(req), kind))
})

contentRouter.get('/content/drafts', requireActive, async (req, res) => {
  res.json(await listBrowsableDrafts(auth(req), parse(kindSchema, req.query.kind)))
})

contentRouter.get('/content/:id', requireActive, async (req, res) => {
  res.json(await itemDetail(await loadItem(prisma, idParam(req.params.id)), auth(req)))
})

contentRouter.patch('/content/:id', requireActive, async (req, res) => {
  const body = parse(z.object({ title: titleSchema.optional(), data: z.unknown().optional() }), req.body)
  await updateWorkingRevision(auth(req), idParam(req.params.id), body)
  res.json({ ok: true })
})

contentRouter.put('/content/:id/members/:personId', requireActive, async (req, res) => {
  const body = parse(z.object({ contribution: z.string().trim().max(1000) }), req.body)
  await setContribution(auth(req), idParam(req.params.id), idParam(req.params.personId), body.contribution)
  res.json({ ok: true })
})

contentRouter.post('/content/:id/invitations', requireActive, async (req, res) => {
  const body = parse(z.object({ personIds: z.array(z.string().min(1).max(40)).min(1).max(20) }), req.body)
  await inviteMembers(auth(req), idParam(req.params.id), body.personIds)
  res.status(201).json({ ok: true })
})

contentRouter.get('/invitations', requireActive, async (req, res) => {
  res.json(await pendingInvitations(auth(req)))
})

contentRouter.post('/invitations/:id/respond', requireActive, async (req, res) => {
  const body = parse(z.object({ accept: z.boolean() }), req.body)
  await respondInvitation(auth(req), idParam(req.params.id), body.accept)
  res.json({ ok: true })
})

contentRouter.post('/content/:id/join-requests', requireActive, async (req, res) => {
  const body = parse(z.object({ message: z.string().trim().max(500).optional() }), req.body ?? {})
  await requestToJoin(auth(req), idParam(req.params.id), body.message)
  res.status(201).json({ ok: true })
})

contentRouter.post('/join-requests/:id/respond', requireActive, async (req, res) => {
  const body = parse(z.object({ accept: z.boolean() }), req.body)
  await respondJoinRequest(auth(req), idParam(req.params.id), body.accept)
  res.json({ ok: true })
})

contentRouter.post('/content/:id/submit', requireActive, async (req, res) => {
  await submitItem(auth(req), idParam(req.params.id))
  res.json({ ok: true })
})

contentRouter.post('/content/:id/withdraw', requireActive, async (req, res) => {
  await withdrawItem(auth(req), idParam(req.params.id))
  res.json({ ok: true })
})

contentRouter.post('/content/:id/revise', requireActive, async (req, res) => {
  res.status(201).json({ revisionId: await startRevision(auth(req), idParam(req.params.id)) })
})

// ---------------- Core
contentRouter.get('/review/queue', requireCore, async (_req, res) => {
  res.json(await reviewQueue())
})

contentRouter.post('/content/:id/review', requireCore, async (req, res) => {
  const body = parse(z.object({ decision: z.enum(['approve', 'reject', 'changes']), note: z.string().trim().max(2000).optional() }), req.body)
  await reviewItem(auth(req), idParam(req.params.id), body.decision, body.note)
  res.json({ ok: true })
})

contentRouter.post('/content/:id/status', requireCore, async (req, res) => {
  const body = parse(z.object({ action: z.enum(['unpublish', 'publish', 'archive', 'restore']) }), req.body)
  await setStatus(auth(req), idParam(req.params.id), body.action)
  res.json({ ok: true })
})

// Events are archived rather than erased so history and audit trails survive.
contentRouter.delete('/content/:id', requireCore, async (req, res) => {
  const item = await loadItem(prisma, idParam(req.params.id))
  if (item.kind !== 'EVENT') throw badRequest('Only events can be deleted; archive other content instead')
  await setStatus(auth(req), item.id, 'archive')
  res.json({ ok: true })
})
