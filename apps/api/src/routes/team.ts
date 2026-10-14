import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db.js'
import { HttpError, notFound } from '../lib/errors.js'
import { parse } from '../lib/validate.js'
import { auth, requireActive } from '../middleware/auth.js'
import { publishedByPerson } from '../services/content.js'

export const teamRouter = Router()

export const REMOVED_MESSAGE = 'This person is no longer a member of the society team.'

const publicMember = (u: {
  role: 'MEMBER' | 'CORE'
  person: { id: string; displayName: string }
  profile: { photoUrl: string | null; domain: string | null } | null
}) => ({
  id: u.person.id,
  name: u.person.displayName,
  photoUrl: u.profile?.photoUrl ?? undefined,
  domain: u.profile?.domain ?? undefined,
  role: u.role === 'CORE' ? ('core' as const) : ('member' as const),
})

// Only ACTIVE accounts appear; removed members vanish from listings entirely.
teamRouter.get('/team', async (req, res) => {
  const preview = req.query.preview === 'true'
  const users = await prisma.user.findMany({
    where: { status: 'ACTIVE' },
    orderBy: [{ role: 'desc' }, { createdAt: 'asc' }],
    take: preview ? 8 : 500,
    include: { person: true, profile: true },
  })
  const all = users.map(publicMember)
  res.json({ core: all.filter((m) => m.role === 'core'), members: all.filter((m) => m.role === 'member') })
})

teamRouter.get('/team/:personId', async (req, res) => {
  const person = await prisma.person.findUnique({
    where: { id: String(req.params.personId) },
    include: { user: { include: { profile: true } } },
  })
  if (!person) throw notFound('Profile not found')
  // Historical credits stay clickable; the only thing revealed is this fixed message.
  if (person.removedAt || person.user?.status === 'REMOVED') throw new HttpError(410, REMOVED_MESSAGE, 'removed')
  const u = person.user
  if (!u || u.status !== 'ACTIVE') throw notFound('Profile not found')
  const p = u.profile
  const work = await publishedByPerson(person.id)
  res.json({
    ...publicMember({ role: u.role, person, profile: p }),
    branch: p?.branch ?? undefined,
    year: p?.year ?? undefined,
    bio: p?.bio ?? undefined,
    github: p?.github ?? undefined,
    linkedin: p?.linkedin ?? undefined,
    instagram: p?.instagram ?? undefined,
    otherLink: p?.otherLink ?? undefined,
    projects: work.projects,
    achievements: work.achievements,
  })
})

const url = z.union([z.literal(''), z.url({ protocol: /^https?$/ }).max(300)]).optional()
const profileSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  photoUrl: url,
  domain: z.string().trim().max(100).optional(),
  branch: z.string().trim().max(100).optional(),
  year: z.string().trim().max(30).optional(),
  bio: z.string().trim().max(1500).optional(),
  github: url,
  linkedin: url,
  instagram: url,
  otherLink: url,
})

// Own profile only: the target is always the session user, never a client-supplied id.
teamRouter.get('/me/profile', requireActive, async (req, res) => {
  const a = auth(req)
  const p = await prisma.profile.findUnique({ where: { userId: a.userId } })
  res.json({ name: a.name, email: a.email, ...p })
})

teamRouter.patch('/me/profile', requireActive, async (req, res) => {
  const a = auth(req)
  const { name, ...fields } = parse(profileSchema, req.body)
  const data = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v === '' ? null : v]))
  await prisma.$transaction(async (tx) => {
    if (name) await tx.person.update({ where: { id: a.personId }, data: { displayName: name } })
    await tx.profile.upsert({ where: { userId: a.userId }, create: { userId: a.userId, ...data }, update: data })
  })
  res.json({ ok: true })
})

teamRouter.get('/members/search', requireActive, async (req, res) => {
  const a = auth(req)
  const q = parse(z.string().trim().max(100).default(''), req.query.q)
  const users = await prisma.user.findMany({
    where: { status: 'ACTIVE', id: { not: a.userId }, person: { displayName: { contains: q, mode: 'insensitive' } } },
    take: 10,
    include: { person: true },
    orderBy: { person: { displayName: 'asc' } },
  })
  res.json(users.map((u) => ({ id: u.person.id, name: u.person.displayName })))
})
