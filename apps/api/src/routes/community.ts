import { extname } from 'node:path'
import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { prisma } from '../db.js'
import { HttpError, badRequest, conflict, notFound } from '../lib/errors.js'
import { normalizeEmail } from '../lib/user.js'
import { parse } from '../lib/validate.js'
import { auth, requireActive, requireAdmin, requireAuth, requireCore } from '../middleware/auth.js'
import { contactLimiter, uploadLimiter } from '../middleware/security.js'
import { audit } from '../services/audit.js'
import { deletePrivateFile, signedDownloadUrl, sniffDocument, sniffImage, uploadImage, uploadPrivateFile } from '../services/cloudinary.js'
import { notifyCore, notifyUsers } from '../services/notify.js'
import { castVote, listRemovals, openRemoval } from '../services/removal.js'

export const communityRouter = Router()
const id = (v: unknown) => parse(z.string().min(1).max(40), v)

// ------------------------------------------------------------ admin: Core promotion

communityRouter.get('/admin/members', requireAdmin, async (_req, res) => {
  const users = await prisma.user.findMany({ where: { status: 'ACTIVE', role: 'MEMBER' }, include: { person: true }, orderBy: { person: { displayName: 'asc' } }, take: 500 })
  res.json(users.map((u) => ({ id: u.person.id, name: u.person.displayName, email: u.person.email })))
})

communityRouter.post('/admin/members/:personId/promote', requireAdmin, async (req, res) => {
  const a = auth(req)
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { personId: id(req.params.personId) }, include: { person: true } })
    if (!user || user.status !== 'ACTIVE') throw notFound('Member not found')
    // Guarded update: concurrent promotions cannot double-fire.
    const changed = await tx.user.updateMany({ where: { id: user.id, role: 'MEMBER', status: 'ACTIVE' }, data: { role: 'CORE' } })
    if (changed.count !== 1) throw conflict('This member is already on the Core team')
    await notifyUsers(tx, [user.id], {
      type: 'role.promoted', title: 'You are now on the Core team',
      body: 'You can now review applications and content from the management dashboard.', link: '/dashboard/management', dedupe: 'promote',
    })
    await notifyCore(tx, { type: 'role.promotion', title: `${user.person.displayName} joined the Core team`, link: '/team', dedupe: user.id }, [user.id])
    await audit(tx, a.userId, 'admin.promote', 'User', user.id)
  })
  res.json({ ok: true })
})

// ------------------------------------------------------------ removal voting

communityRouter.get('/removals', requireCore, async (req, res) => res.json(await listRemovals(auth(req))))

communityRouter.post('/removals', requireCore, async (req, res) => {
  const body = parse(z.object({ personId: z.string().min(1).max(40), reason: z.string().trim().max(1000).optional() }), req.body)
  res.status(201).json({ id: await openRemoval(auth(req), body.personId, body.reason) })
})

communityRouter.post('/removals/:id/vote', requireCore, async (req, res) => {
  const body = parse(z.object({ approve: z.boolean() }), req.body)
  res.json({ status: await castVote(auth(req), id(req.params.id), body.approve) })
})

// ------------------------------------------------------------ notifications

communityRouter.get('/notifications', requireAuth, async (req, res) => {
  const a = auth(req)
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId: a.userId }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.notification.count({ where: { userId: a.userId, readAt: null } }),
  ])
  res.json({ unread, items })
})

communityRouter.post('/notifications/read-all', requireAuth, async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: auth(req).userId, readAt: null }, data: { readAt: new Date() } })
  res.json({ ok: true })
})

communityRouter.post('/notifications/:id/read', requireAuth, async (req, res) => {
  // Scoped to the caller: one user can never mark another's notification.
  await prisma.notification.updateMany({ where: { id: id(req.params.id), userId: auth(req).userId, readAt: null }, data: { readAt: new Date() } })
  res.json({ ok: true })
})

// ------------------------------------------------------------ contact form

communityRouter.post('/contact', contactLimiter, async (req, res) => {
  const body = parse(z.object({
    name: z.string().trim().min(1).max(100),
    email: z.string().trim().max(254).transform(normalizeEmail).pipe(z.email()),
    subject: z.string().trim().min(1).max(200),
    message: z.string().trim().min(10).max(4000),
    website: z.string().optional(), // honeypot
  }), req.body)
  // Bots fill the hidden field; pretend success without storing or notifying anyone.
  if (body.website) return void res.status(202).json({ ok: true })
  await prisma.$transaction(async (tx) => {
    const sub = await tx.contactSubmission.create({ data: { name: body.name, email: body.email, subject: body.subject, message: body.message } })
    await notifyCore(tx, {
      type: 'contact.new', title: `Contact: ${body.subject}`,
      body: `From ${body.name} <${body.email}>\n\n${body.message.slice(0, 1500)}`, link: '/dashboard/management', dedupe: sub.id,
    })
  })
  res.status(202).json({ ok: true })
})

communityRouter.get('/contact/submissions', requireCore, async (_req, res) => {
  res.json(await prisma.contactSubmission.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }))
})

// ------------------------------------------------------------ uploads

const memory = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } })

communityRouter.post('/uploads/image', requireActive, uploadLimiter, memory.single('file'), async (req, res) => {
  const f = req.file
  if (!f) throw badRequest('No file received')
  if (f.size > 5 * 1024 * 1024) throw new HttpError(413, 'Images must be 5 MB or smaller')
  if (!sniffImage(f.buffer)) throw badRequest('Only JPEG, PNG or WebP images are allowed')
  res.status(201).json({ url: await uploadImage(f.buffer) })
})

// ------------------------------------------------------------ learning materials

const ALLOWED_EXT = new Set(['.pdf', '.pptx', '.docx', '.xlsx', '.zip'])

communityRouter.get('/learning', requireActive, async (_req, res) => {
  const rows = await prisma.learningMaterial.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 200 })
  res.json(rows.map((m) => ({
    id: m.id, title: m.title, description: m.description ?? undefined, category: m.category ?? undefined,
    fileType: m.fileType, uploadedAt: m.createdAt, downloadPath: `/learning/${m.id}/download`,
  })))
})

// Short-lived signed URL; the file is never publicly addressable.
communityRouter.get('/learning/:id/download', requireActive, async (req, res) => {
  const m = await prisma.learningMaterial.findFirst({ where: { id: id(req.params.id), deletedAt: null } })
  if (!m) throw notFound('Material not found')
  res.redirect(302, signedDownloadUrl(m.publicId))
})

communityRouter.post('/learning', requireCore, uploadLimiter, memory.single('file'), async (req, res) => {
  const a = auth(req)
  const f = req.file
  if (!f) throw badRequest('No file received')
  const meta = parse(z.object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(1000).optional(),
    category: z.string().trim().max(100).optional(),
  }), req.body)
  const ext = extname(f.originalname).toLowerCase()
  const kind = sniffDocument(f.buffer)
  const ok = kind === 'pdf' ? ext === '.pdf' : kind === 'zip' ? ALLOWED_EXT.has(ext) && ext !== '.pdf' : false
  if (!ALLOWED_EXT.has(ext) || !ok) throw badRequest('Allowed files: PDF, DOCX, PPTX, XLSX, ZIP')
  const stored = await uploadPrivateFile(f.buffer, f.originalname.replace(/[^\w.\- ]/g, '_').slice(0, 100))
  const row = await prisma.learningMaterial.create({
    data: { title: meta.title, description: meta.description || null, category: meta.category || null, fileType: ext.slice(1), publicId: stored.publicId, resourceType: 'raw', bytes: stored.bytes, uploadedById: a.userId },
  })
  await audit(prisma, a.userId, 'learning.upload', 'LearningMaterial', row.id)
  res.status(201).json({ id: row.id })
})

communityRouter.delete('/learning/:id', requireCore, async (req, res) => {
  const m = await prisma.learningMaterial.findFirst({ where: { id: id(req.params.id), deletedAt: null } })
  if (!m) throw notFound('Material not found')
  await prisma.learningMaterial.update({ where: { id: m.id }, data: { deletedAt: new Date() } })
  await deletePrivateFile(m.publicId).catch(() => undefined)
  await audit(prisma, auth(req).userId, 'learning.delete', 'LearningMaterial', m.id)
  res.json({ ok: true })
})
