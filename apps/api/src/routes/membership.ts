import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import { conflict, forbidden, notFound } from '../lib/errors.js'
import { parse } from '../lib/validate.js'
import { auth, requireAuth, requireCore } from '../middleware/auth.js'
import { audit } from '../services/audit.js'
import { emailAddress, notifyCore, notifyUsers } from '../services/notify.js'

export const membershipRouter = Router()

const text = (max: number) => z.string().trim().max(max)
const applicationSchema = z.object({
  name: text(100).min(1, 'Please enter your name'),
  branch: text(100).min(1, 'Please enter your branch'),
  year: text(30).min(1, 'Please enter your academic year'),
  domain: text(100).optional(),
  statement: text(2000).optional(),
})

// An applicant is signed in with a limited session (status VERIFIED or REJECTED).
membershipRouter.post('/membership/applications', requireAuth, async (req, res) => {
  const a = auth(req)
  if (a.status !== 'VERIFIED' && a.status !== 'REJECTED') {
    throw forbidden('An application cannot be submitted for this account')
  }
  const body = parse(applicationSchema, req.body)
  const app = await prisma.$transaction(async (tx) => {
    // Guard against double submission racing past the status check.
    const moved = await tx.user.updateMany({
      where: { id: a.userId, status: { in: ['VERIFIED', 'REJECTED'] } },
      data: { status: 'PENDING_APPROVAL' },
    })
    if (moved.count !== 1) throw conflict('An application is already pending')
    await tx.person.update({ where: { id: a.personId }, data: { displayName: body.name } })
    const created = await tx.membershipApplication.create({
      data: { userId: a.userId, name: body.name, branch: body.branch, year: body.year, domain: body.domain || null, statement: body.statement || null },
    })
    await notifyCore(tx, {
      type: 'application.new',
      title: 'New membership application',
      body: `${body.name} (${a.email}) applied to join. Branch: ${body.branch}, year ${body.year}.`,
      link: '/dashboard/management',
      dedupe: created.id,
    })
    return created
  })
  res.status(201).json({ id: app.id, status: app.status })
})

membershipRouter.get('/membership/applications', requireCore, async (req, res) => {
  const status = parse(z.enum(['PENDING', 'APPROVED', 'REJECTED']).default('PENDING'), req.query.status)
  const rows = await prisma.membershipApplication.findMany({
    where: { status },
    orderBy: { createdAt: 'asc' },
    take: 100,
    include: { user: { select: { person: { select: { email: true } } } } },
  })
  res.json(rows.map((r) => ({
    id: r.id, name: r.name, email: r.user.person.email, branch: r.branch, year: r.year,
    domain: r.domain, statement: r.statement, status: r.status, createdAt: r.createdAt,
  })))
})

membershipRouter.post('/membership/applications/:id/approve', requireCore, async (req, res) => {
  const a = auth(req)
  await prisma.$transaction(async (tx) => {
    const app = await tx.membershipApplication.findUnique({ where: { id: String(req.params.id) } })
    if (!app) throw notFound('Application not found')
    // Any one Core member may approve; the status guard makes concurrent approvals idempotent.
    const claimed = await tx.membershipApplication.updateMany({
      where: { id: app.id, status: 'PENDING' },
      data: { status: 'APPROVED', decidedById: a.userId, decidedAt: new Date() },
    })
    if (claimed.count !== 1) throw conflict('This application has already been decided')
    const user = await tx.user.update({ where: { id: app.userId }, data: { status: 'ACTIVE', role: 'MEMBER' } })
    // Fresh profile: a rejoining member never gets old profile data back.
    await tx.profile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, branch: app.branch, year: app.year, domain: app.domain },
      update: { branch: app.branch, year: app.year, domain: app.domain },
    })
    await tx.person.update({ where: { id: user.personId }, data: { displayName: app.name, removedAt: null } })
    await notifyUsers(tx, [user.id], {
      type: 'application.approved',
      title: 'Welcome to Spectrum DTU',
      body: 'Congratulations! Your membership application has been approved. You can now log in and complete your profile.',
      link: '/dashboard',
      dedupe: app.id,
    })
    await audit(tx, a.userId, 'membership.approve', 'MembershipApplication', app.id)
  })
  res.json({ ok: true })
})

membershipRouter.post('/membership/applications/:id/reject', requireCore, async (req, res) => {
  const a = auth(req)
  const body = parse(z.object({ note: text(500).optional() }), req.body ?? {})
  await prisma.$transaction(async (tx) => {
    const app = await tx.membershipApplication.findUnique({ where: { id: String(req.params.id) }, include: { user: { include: { person: true } } } })
    if (!app) throw notFound('Application not found')
    const claimed = await tx.membershipApplication.updateMany({
      where: { id: app.id, status: 'PENDING' },
      data: { status: 'REJECTED', decidedById: a.userId, decidedAt: new Date() },
    })
    if (claimed.count !== 1) throw conflict('This application has already been decided')
    await tx.user.update({ where: { id: app.userId }, data: { status: 'REJECTED' } })
    await emailAddress(
      tx, app.user.person.email, 'Application update',
      `Thank you for applying to Spectrum DTU. Your application was not approved at this time.${body.note ? `\n\nNote from the core team: ${body.note}` : ''}`,
      `application.rejected:${app.id}`,
    )
    await audit(tx, a.userId, 'membership.reject', 'MembershipApplication', app.id)
  })
  res.json({ ok: true })
})
