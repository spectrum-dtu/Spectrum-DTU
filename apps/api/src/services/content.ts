import { z } from 'zod'
import { env } from '../config/env.js'
import { prisma, type Db, type Tx } from '../db.js'
import type { ContentKind } from '../generated/prisma/enums.js'
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js'
import type { AuthContext } from '../middleware/auth.js'
import { audit } from './audit.js'
import { notifyCore, notifyUsers } from './notify.js'

// ---------------------------------------------------------------- field schemas

const emptyToUndef = (v: unknown) => (v === '' || v === null ? undefined : v)
const optStr = (max: number) => z.preprocess(emptyToUndef, z.string().trim().max(max).optional())
const optDate = z.preprocess(emptyToUndef, z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid date').optional())
const optUrl = z.preprocess(emptyToUndef, z.url({ protocol: /^https?$/ }).max(500).optional())
// Images must come from our Cloudinary account when it is configured (no arbitrary hotlinks).
const optImage = z.preprocess(
  emptyToUndef,
  z
    .url({ protocol: /^https$/ })
    .max(500)
    .refine(
      (u) => !env.CLOUDINARY_CLOUD_NAME || u.startsWith(`https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/`),
      'Image must be uploaded through the site',
    )
    .optional(),
)

export const dataSchemas = {
  PROJECT: z.object({
    summary: optStr(300), description: optStr(10000), coverUrl: optImage, domain: optStr(100),
    technologies: z.array(z.string().trim().min(1).max(50)).max(30).optional(),
    githubUrl: optUrl, demoUrl: optUrl, startDate: optDate, completedDate: optDate,
  }),
  ACHIEVEMENT: z.object({
    description: optStr(5000), imageUrl: optImage, date: optDate, event: optStr(150), position: optStr(100), link: optUrl,
  }),
  EVENT: z.object({
    summary: optStr(300), description: optStr(10000), imageUrl: optImage, startsAt: optDate, endsAt: optDate, location: optStr(200),
  }),
} satisfies Record<ContentKind, z.ZodType>

export const titleSchema = z.string().trim().min(1, 'A title is required').max(200)

type Data = Record<string, unknown>

export function sortDateOf(kind: ContentKind, d: Data): Date | null {
  const v = kind === 'PROJECT' ? (d.completedDate ?? d.startDate) : kind === 'ACHIEVEMENT' ? d.date : d.startsAt
  return typeof v === 'string' ? new Date(v) : null
}

export const KIND_PATH: Record<ContentKind, string> = { PROJECT: 'projects', ACHIEVEMENT: 'achievements', EVENT: 'events' }
const KIND_LABEL: Record<ContentKind, string> = { PROJECT: 'project', ACHIEVEMENT: 'achievement', EVENT: 'event' }
const link = (kind: ContentKind, id: string) => `/dashboard/${KIND_PATH[kind]}/${id}`

const OPEN = ['DRAFT', 'AWAITING_CORE_APPROVAL', 'CHANGES_REQUESTED'] as const
const EDITABLE = ['DRAFT', 'CHANGES_REQUESTED'] as const
const DRAFT_STATUSES = ['DRAFT', 'AWAITING_CONFIRMATION', 'CHANGES_REQUESTED'] as const

// ---------------------------------------------------------------- loading

const itemInclude = {
  revisions: { orderBy: { number: 'desc' as const } },
  published: true,
  members: { include: { person: true } },
  invitations: { where: { status: 'PENDING' as const } },
} as const

export async function loadItem(db: Db, id: string) {
  const item = await db.contentItem.findUnique({ where: { id }, include: itemInclude })
  if (!item) throw notFound('Not found')
  return item
}
type Item = Awaited<ReturnType<typeof loadItem>>

const openRevision = (item: Item) => item.revisions.find((r) => (OPEN as readonly string[]).includes(r.state))
const isMember = (item: Item, personId: string) => item.members.some((m) => m.personId === personId)
const isOwner = (item: Item, personId: string) => item.members.some((m) => m.personId === personId && m.role === 'OWNER')
const isCore = (a: AuthContext) => a.role === 'CORE' && a.status === 'ACTIVE'
const memberUserIds = async (db: Db, item: Item) =>
  (await db.user.findMany({ where: { personId: { in: item.members.map((m) => m.personId) } }, select: { id: true } })).map((u) => u.id)

// ---------------------------------------------------------------- visibility

// Who can read a (non-public) item. Returns null when the viewer must get a 404.
export function viewMode(item: Item, a: AuthContext): 'member' | 'draft' | 'core' | 'published' | null {
  if (isMember(item, a.personId)) return 'member'
  const open = openRevision(item)
  // Other members may browse project/achievement drafts; Core may not until submission.
  if (item.kind !== 'EVENT' && !isCore(a) && open && (DRAFT_STATUSES as readonly string[]).includes(item.status)) return 'draft'
  if (isCore(a) && (open?.state === 'AWAITING_CORE_APPROVAL' || ['PUBLISHED', 'UNPUBLISHED', 'ARCHIVED', 'AWAITING_CORE_APPROVAL'].includes(item.status))) return 'core'
  if (item.status === 'PUBLISHED') return 'published'
  return null
}

const personView = (p: { id: string; displayName: string; removedAt: Date | null }) => ({
  id: p.id, name: p.displayName, removed: p.removedAt !== null,
})

const revisionView = (r: Item['revisions'][number] | null | undefined) =>
  r ? { id: r.id, number: r.number, state: r.state, title: r.title, data: r.data as Data, reviewNote: r.reviewNote, submittedAt: r.submittedAt, updatedAt: r.createdAt } : null

export async function itemDetail(item: Item, a: AuthContext) {
  const mode = viewMode(item, a)
  if (!mode) throw notFound('Not found')
  const open = openRevision(item)
  const owner = isOwner(item, a.personId)
  const base = {
    id: item.id, kind: item.kind, status: item.status, mode,
    canEdit: mode === 'member' && !!open && (EDITABLE as readonly string[]).includes(open.state) && !(open.state === 'DRAFT' && open.submittedAt),
    isOwner: owner,
    awaitingConfirmation: !!open && open.state === 'DRAFT' && open.submittedAt !== null,
    published: revisionView(item.published),
    // Drafts are shown as the working revision; viewers without access only see published data.
    working: mode === 'published' ? null : revisionView(open),
    members: item.members.map((m) => ({ ...personView(m.person), role: m.role, contribution: m.contribution })),
  }
  if (!owner) return { ...base, invitations: [], joinRequests: [], myJoinRequest: mode === 'draft' ? await prisma.contentJoinRequest.findUnique({ where: { itemId_requesterPersonId: { itemId: item.id, requesterPersonId: a.personId } } }) : null }
  const [invitations, joinRequests] = await Promise.all([
    prisma.contentInvitation.findMany({ where: { itemId: item.id, status: 'PENDING' } }),
    prisma.contentJoinRequest.findMany({ where: { itemId: item.id, status: 'PENDING' } }),
  ])
  const ids = [...invitations.map((i) => i.inviteePersonId), ...joinRequests.map((j) => j.requesterPersonId)]
  const people = await prisma.person.findMany({ where: { id: { in: ids } } })
  const nameOf = (id: string) => people.find((p) => p.id === id)?.displayName ?? 'Member'
  return {
    ...base,
    invitations: invitations.map((i) => ({ id: i.id, personId: i.inviteePersonId, name: nameOf(i.inviteePersonId) })),
    joinRequests: joinRequests.map((j) => ({ id: j.id, personId: j.requesterPersonId, name: nameOf(j.requesterPersonId), message: j.message })),
    myJoinRequest: null,
  }
}

// ---------------------------------------------------------------- creation & editing

export async function createItem(a: AuthContext, kind: ContentKind, title: string, rawData: unknown) {
  const data = dataSchemas[kind].parse(rawData ?? {}) as Data
  return prisma.$transaction(async (tx) => {
    const item = await tx.contentItem.create({ data: { kind, creatorPersonId: a.personId } })
    await tx.contentMember.create({ data: { itemId: item.id, personId: a.personId, role: 'OWNER' } })
    await tx.contentRevision.create({
      data: { itemId: item.id, number: 1, title, data: data as object, sortDate: sortDateOf(kind, data), createdById: a.userId },
    })
    await audit(tx, a.userId, `${KIND_LABEL[kind]}.create`, 'ContentItem', item.id)
    return item.id
  })
}

export async function updateWorkingRevision(a: AuthContext, id: string, input: { title?: string; data?: unknown }) {
  return prisma.$transaction(async (tx) => {
    const item = await loadItem(tx, id)
    if (!isMember(item, a.personId)) throw forbidden('Only contributors can edit this')
    const rev = openRevision(item)
    if (!rev || !(EDITABLE as readonly string[]).includes(rev.state)) throw conflict('This item cannot be edited right now')
    if (rev.state === 'DRAFT' && rev.submittedAt) throw conflict('Withdraw the submission before editing')
    const data = input.data !== undefined ? (dataSchemas[item.kind].parse(input.data) as Data) : (rev.data as Data)
    const updated = await tx.contentRevision.updateMany({
      where: { id: rev.id, state: rev.state },
      data: { title: input.title ?? rev.title, data: data as object, sortDate: sortDateOf(item.kind, data) },
    })
    if (updated.count !== 1) throw conflict('The item changed while you were editing')
    await audit(tx, a.userId, `${KIND_LABEL[item.kind]}.edit`, 'ContentItem', id, { revision: rev.number })
  })
}

export async function setContribution(a: AuthContext, id: string, personId: string, contribution: string) {
  const item = await loadItem(prisma, id)
  const mine = isOwner(item, a.personId) || a.personId === personId
  if (!isMember(item, a.personId) || !mine) throw forbidden()
  if (!isMember(item, personId)) throw notFound('Contributor not found')
  await prisma.contentMember.update({ where: { itemId_personId: { itemId: id, personId } }, data: { contribution: contribution || null } })
}

// ---------------------------------------------------------------- collaboration

export async function inviteMembers(a: AuthContext, id: string, personIds: string[]) {
  await prisma.$transaction(async (tx) => {
    const item = await loadItem(tx, id)
    if (item.kind === 'EVENT') throw badRequest('Events do not take contributors')
    if (!isOwner(item, a.personId)) throw forbidden('Only the creator can invite members')
    const open = openRevision(item)
    if (!open || !(EDITABLE as readonly string[]).includes(open.state)) throw conflict('Invitations are only possible while editing')
    const people = await tx.user.findMany({ where: { personId: { in: personIds }, status: 'ACTIVE' }, select: { id: true, personId: true } })
    if (people.length !== new Set(personIds).size) throw badRequest('One or more people cannot be invited')
    for (const p of people) {
      if (isMember(item, p.personId)) continue
      const inv = await tx.contentInvitation.upsert({
        where: { itemId_inviteePersonId: { itemId: id, inviteePersonId: p.personId } },
        create: { itemId: id, inviteePersonId: p.personId, invitedById: a.userId },
        update: { status: 'PENDING', invitedById: a.userId, respondedAt: null },
      })
      await notifyUsers(tx, [p.id], {
        type: 'content.invitation',
        title: `${a.name} invited you to a ${KIND_LABEL[item.kind]}`,
        body: `"${open.title}" — open your dashboard to accept or decline.`,
        link: '/dashboard/invitations',
        dedupe: `${inv.id}:${inv.invitedById}:${inv.createdAt.getTime()}`,
      })
    }
    await audit(tx, a.userId, 'content.invite', 'ContentItem', id, { personIds })
  })
}

export async function respondInvitation(a: AuthContext, invitationId: string, accept: boolean) {
  await prisma.$transaction(async (tx) => {
    const inv = await tx.contentInvitation.findUnique({ where: { id: invitationId } })
    if (!inv || inv.inviteePersonId !== a.personId) throw notFound('Invitation not found')
    const claimed = await tx.contentInvitation.updateMany({
      where: { id: inv.id, status: 'PENDING' },
      data: { status: accept ? 'ACCEPTED' : 'DECLINED', respondedAt: new Date() },
    })
    if (claimed.count !== 1) throw conflict('You have already responded to this invitation')
    if (accept) await tx.contentMember.create({ data: { itemId: inv.itemId, personId: a.personId, role: 'CONTRIBUTOR' } })
    const item = await loadItem(tx, inv.itemId)
    const open = openRevision(item)
    const others = await memberUserIds(tx, item)
    await notifyUsers(tx, others.filter((u) => u !== a.userId), {
      type: accept ? 'content.invitation_accepted' : 'content.invitation_declined',
      title: `${a.name} ${accept ? 'accepted' : 'declined'} the invitation`,
      body: `"${open?.title ?? item.published?.title ?? 'Untitled'}"`,
      link: link(item.kind, item.id),
      dedupe: inv.id,
    })
    await advanceIfReady(tx, item.id)
  })
}

export async function requestToJoin(a: AuthContext, id: string, message?: string) {
  await prisma.$transaction(async (tx) => {
    const item = await loadItem(tx, id)
    if (viewMode(item, a) !== 'draft') throw notFound('Not found')
    if (isMember(item, a.personId)) throw conflict('You are already a contributor')
    const req = await tx.contentJoinRequest.upsert({
      where: { itemId_requesterPersonId: { itemId: id, requesterPersonId: a.personId } },
      create: { itemId: id, requesterPersonId: a.personId, message },
      update: { status: 'PENDING', message, respondedAt: null },
    })
    const owners = await tx.user.findMany({ where: { personId: { in: item.members.filter((m) => m.role === 'OWNER').map((m) => m.personId) } }, select: { id: true } })
    await notifyUsers(tx, owners.map((o) => o.id), {
      type: 'content.join_request',
      title: `${a.name} wants to join your ${KIND_LABEL[item.kind]}`,
      body: message,
      link: link(item.kind, id),
      dedupe: `${req.id}:${req.createdAt.getTime()}:${req.status}`,
    })
  })
}

export async function respondJoinRequest(a: AuthContext, requestId: string, accept: boolean) {
  await prisma.$transaction(async (tx) => {
    const jr = await tx.contentJoinRequest.findUnique({ where: { id: requestId } })
    if (!jr) throw notFound('Request not found')
    const item = await loadItem(tx, jr.itemId)
    if (!isOwner(item, a.personId)) throw forbidden('Only the creator can respond')
    const claimed = await tx.contentJoinRequest.updateMany({
      where: { id: jr.id, status: 'PENDING' },
      data: { status: accept ? 'ACCEPTED' : 'DECLINED', respondedAt: new Date() },
    })
    if (claimed.count !== 1) throw conflict('This request has already been answered')
    if (accept) await tx.contentMember.upsert({ where: { itemId_personId: { itemId: item.id, personId: jr.requesterPersonId } }, create: { itemId: item.id, personId: jr.requesterPersonId }, update: {} })
    const requester = await tx.user.findUnique({ where: { personId: jr.requesterPersonId }, select: { id: true } })
    if (requester) {
      await notifyUsers(tx, [requester.id], {
        type: accept ? 'content.join_accepted' : 'content.join_declined',
        title: `Your request to join was ${accept ? 'accepted' : 'declined'}`,
        body: openRevision(item)?.title,
        link: link(item.kind, item.id),
        dedupe: `${jr.id}:${jr.createdAt.getTime()}`,
      })
    }
  })
}

// ---------------------------------------------------------------- submission & review

// Moves an item that was waiting on invitees to the Core queue once nobody is pending.
async function advanceIfReady(tx: Tx, itemId: string) {
  const item = await loadItem(tx, itemId)
  const open = openRevision(item)
  if (!open || open.state !== 'DRAFT' || !open.submittedAt) return
  if (item.invitations.length > 0) return
  await sendToCore(tx, item, open.id, open.title)
}

async function sendToCore(tx: Tx, item: Item, revisionId: string, title: string) {
  const moved = await tx.contentRevision.updateMany({
    where: { id: revisionId, state: 'DRAFT' },
    data: { state: 'AWAITING_CORE_APPROVAL', submittedAt: new Date() },
  })
  if (moved.count !== 1) return
  if (!item.publishedRevisionId) await tx.contentItem.update({ where: { id: item.id }, data: { status: 'AWAITING_CORE_APPROVAL' } })
  const isRevision = !!item.publishedRevisionId
  await notifyCore(tx, {
    type: 'content.submitted',
    title: `${isRevision ? 'Revision submitted' : 'Submitted for review'}: ${title}`,
    body: `A ${KIND_LABEL[item.kind]} ${isRevision ? 'revision ' : ''}is awaiting Core approval.`,
    link: '/dashboard/management',
    dedupe: revisionId,
  })
}

export async function submitItem(a: AuthContext, id: string) {
  await prisma.$transaction(async (tx) => {
    const item = await loadItem(tx, id)
    // Projects/achievements: the creator submits. Events: any editor (incl. Core editing a live event).
    if (!(isOwner(item, a.personId) || (item.kind === 'EVENT' && isMember(item, a.personId)))) throw forbidden('Only the creator can submit')
    const open = openRevision(item)
    if (!open || !(EDITABLE as readonly string[]).includes(open.state) || (open.state === 'DRAFT' && open.submittedAt)) {
      throw conflict('Nothing to submit')
    }
    if (item.invitations.length > 0) {
      // Wait for invitees before Core sees it.
      await tx.contentRevision.update({ where: { id: open.id }, data: { submittedAt: new Date(), state: 'DRAFT' } })
      if (!item.publishedRevisionId) await tx.contentItem.update({ where: { id }, data: { status: 'AWAITING_CONFIRMATION' } })
    } else {
      await tx.contentRevision.update({ where: { id: open.id }, data: { state: 'DRAFT', submittedAt: new Date() } })
      await sendToCore(tx, item, open.id, open.title)
    }
    await audit(tx, a.userId, `${KIND_LABEL[item.kind]}.submit`, 'ContentItem', id, { revision: open.number })
  })
}

export async function withdrawItem(a: AuthContext, id: string) {
  await prisma.$transaction(async (tx) => {
    const item = await loadItem(tx, id)
    if (!(isOwner(item, a.personId) || (item.kind === 'EVENT' && isMember(item, a.personId)))) throw forbidden('Only the creator can withdraw')
    const open = openRevision(item)
    if (!open || !open.submittedAt || !['DRAFT', 'AWAITING_CORE_APPROVAL'].includes(open.state)) throw conflict('Nothing to withdraw')
    await tx.contentRevision.update({ where: { id: open.id }, data: { state: 'DRAFT', submittedAt: null } })
    if (!item.publishedRevisionId) await tx.contentItem.update({ where: { id }, data: { status: 'DRAFT' } })
  })
}

export async function startRevision(a: AuthContext, id: string) {
  return prisma.$transaction(async (tx) => {
    const item = await loadItem(tx, id)
    const core = isCore(a)
    // Contributors may revise; for events Core may also edit (and joins the editors).
    if (!isMember(item, a.personId) && !(item.kind === 'EVENT' && core)) throw forbidden('Only contributors can revise this')
    if (!item.published || !['PUBLISHED', 'UNPUBLISHED'].includes(item.status)) throw conflict('Only published items can be revised')
    if (openRevision(item)) throw conflict('A revision is already in progress')
    if (!isMember(item, a.personId)) await tx.contentMember.create({ data: { itemId: id, personId: a.personId, role: 'CONTRIBUTOR' } })
    const next = (item.revisions[0]?.number ?? 0) + 1
    const rev = await tx.contentRevision.create({
      data: {
        itemId: id, number: next, title: item.published.title, data: item.published.data as object,
        sortDate: item.published.sortDate, createdById: a.userId,
      },
    })
    await notifyUsers(tx, (await memberUserIds(tx, item)).filter((u) => u !== a.userId), {
      type: 'content.revision_started',
      title: `A revision of "${item.published.title}" was started`,
      body: `${a.name} started editing. The published version stays unchanged until Core approves.`,
      link: link(item.kind, id),
      dedupe: rev.id,
    })
    await audit(tx, a.userId, `${KIND_LABEL[item.kind]}.revise`, 'ContentItem', id, { revision: next })
    return rev.id
  })
}

export async function reviewItem(a: AuthContext, id: string, decision: 'approve' | 'reject' | 'changes', note?: string) {
  await prisma.$transaction(async (tx) => {
    const item = await loadItem(tx, id)
    const rev = item.revisions.find((r) => r.state === 'AWAITING_CORE_APPROVAL')
    if (!rev) throw conflict('Nothing is awaiting review')
    if (decision !== 'approve' && !note?.trim()) throw badRequest('Please add a note explaining your decision')
    const decided = { decidedAt: new Date(), decidedById: a.userId, reviewNote: note?.trim() || null }
    const members = await memberUserIds(tx, item)
    const isRevision = !!item.publishedRevisionId
    const guard = { id: rev.id, state: 'AWAITING_CORE_APPROVAL' as const }

    if (decision === 'approve') {
      const ok = await tx.contentRevision.updateMany({ where: guard, data: { state: 'APPROVED', ...decided } })
      if (ok.count !== 1) throw conflict('This was already reviewed')
      if (item.publishedRevisionId) await tx.contentRevision.update({ where: { id: item.publishedRevisionId }, data: { state: 'SUPERSEDED' } })
      await tx.contentItem.update({ where: { id }, data: { publishedRevisionId: rev.id, status: 'PUBLISHED', publishedAt: new Date() } })
    } else if (decision === 'changes') {
      const ok = await tx.contentRevision.updateMany({ where: guard, data: { state: 'CHANGES_REQUESTED', ...decided } })
      if (ok.count !== 1) throw conflict('This was already reviewed')
      if (!isRevision) await tx.contentItem.update({ where: { id }, data: { status: 'CHANGES_REQUESTED' } })
    } else {
      // Reject: a first submission returns to an editable draft; a rejected revision of a
      // published item is closed and the published version simply stays as it was.
      const ok = await tx.contentRevision.updateMany({
        where: guard,
        data: isRevision ? { state: 'REJECTED', ...decided } : { state: 'DRAFT', submittedAt: null, ...decided },
      })
      if (ok.count !== 1) throw conflict('This was already reviewed')
      if (!isRevision) await tx.contentItem.update({ where: { id }, data: { status: 'DRAFT' } })
    }
    const verb = { approve: 'approved', reject: 'rejected', changes: 'sent back with requested changes' }[decision]
    await notifyUsers(tx, members, {
      type: `content.${decision}`,
      title: `"${rev.title}" was ${verb}`,
      body: note?.trim() || (decision === 'approve' ? (isRevision ? 'The new version is now live.' : 'It is now published.') : undefined),
      link: link(item.kind, id),
      dedupe: rev.id,
    })
    await audit(tx, a.userId, `${KIND_LABEL[item.kind]}.review.${decision}`, 'ContentItem', id, { revision: rev.number, note })
  })
}

// Core-only status changes.
export async function setStatus(a: AuthContext, id: string, action: 'unpublish' | 'publish' | 'archive' | 'restore') {
  await prisma.$transaction(async (tx) => {
    const item = await loadItem(tx, id)
    const members = await memberUserIds(tx, item)
    let status = item.status
    if (action === 'unpublish') {
      if (item.status !== 'PUBLISHED') throw conflict('Only published items can be unpublished')
      status = 'UNPUBLISHED'
    } else if (action === 'publish') {
      if (item.status !== 'UNPUBLISHED' || !item.publishedRevisionId) throw conflict('Only unpublished items can be republished')
      status = 'PUBLISHED'
    } else if (action === 'archive') {
      if (item.status === 'ARCHIVED') throw conflict('Already archived')
      status = 'ARCHIVED'
    } else {
      if (item.status !== 'ARCHIVED') throw conflict('Only archived items can be restored')
      status = item.publishedRevisionId ? 'UNPUBLISHED' : 'DRAFT'
    }
    await tx.contentItem.update({ where: { id }, data: { status } })
    await notifyUsers(tx, members, {
      type: `content.${action}`,
      title: `"${item.published?.title ?? openRevision(item)?.title ?? 'Untitled'}" was ${action}${action.endsWith('e') ? 'd' : 'ed'}`,
      link: link(item.kind, id),
      dedupe: `${action}:${Date.now()}`,
    })
    await audit(tx, a.userId, `${KIND_LABEL[item.kind]}.${action}`, 'ContentItem', id)
  })
}

// ---------------------------------------------------------------- listings

type Pub = { id: string; kind: ContentKind; published: NonNullable<Item['published']>; members: Item['members'] }

export const publicShape = (it: Pub) => ({
  id: it.id,
  title: it.published.title,
  ...(it.published.data as Data),
  contributors: it.members.map((m) => ({ ...personView(m.person), contribution: m.contribution ?? undefined })),
})

export async function listPublished(kind: ContentKind, opts: { limit?: number; featured?: boolean } = {}) {
  const items = await prisma.contentItem.findMany({
    where: { kind, status: 'PUBLISHED', publishedRevisionId: { not: null } },
    include: { published: true, members: { include: { person: true } } },
    orderBy: { publishedAt: 'desc' },
    take: opts.limit ?? 100,
  })
  const withDate = items.filter((i): i is typeof i & { published: NonNullable<typeof i.published> } => !!i.published)
  withDate.sort((a, b) => (b.published.sortDate?.getTime() ?? 0) - (a.published.sortDate?.getTime() ?? 0))
  return withDate.map(publicShape)
}

export async function getPublished(kind: ContentKind, id: string) {
  const item = await prisma.contentItem.findFirst({
    where: { id, kind, status: 'PUBLISHED' },
    include: { published: true, members: { include: { person: true } } },
  })
  if (!item?.published) throw notFound('Not found')
  return publicShape({ ...item, published: item.published })
}

export async function publishedByPerson(personId: string) {
  const links = await prisma.contentMember.findMany({
    where: { personId, item: { status: 'PUBLISHED', publishedRevisionId: { not: null } } },
    include: { item: { include: { published: true } } },
  })
  const pick = (kind: ContentKind) =>
    links.filter((l) => l.item.kind === kind && l.item.published).map((l) => ({ id: l.item.id, title: l.item.published!.title }))
  return { projects: pick('PROJECT'), achievements: pick('ACHIEVEMENT') }
}

const summaryOf = (item: Item) => {
  const open = openRevision(item)
  const rev = open ?? item.published ?? item.revisions[0]
  return {
    id: item.id, kind: item.kind, status: item.status, title: rev?.title ?? 'Untitled',
    revisionState: open?.state ?? null, awaitingConfirmation: !!open && open.state === 'DRAFT' && !!open.submittedAt,
    updatedAt: item.updatedAt, memberCount: item.members.length,
  }
}

export async function listMine(a: AuthContext, kind?: ContentKind) {
  const items = await prisma.contentItem.findMany({
    where: { ...(kind ? { kind } : {}), members: { some: { personId: a.personId } } },
    include: itemInclude,
    orderBy: { updatedAt: 'desc' },
    take: 200,
  })
  return items.map(summaryOf)
}

// Drafts by others that members may browse (never shown to Core; never events).
export async function listBrowsableDrafts(a: AuthContext, kind: ContentKind) {
  if (isCore(a) || kind === 'EVENT') return []
  const items = await prisma.contentItem.findMany({
    where: { kind, status: { in: [...DRAFT_STATUSES] }, members: { none: { personId: a.personId } } },
    include: itemInclude,
    orderBy: { updatedAt: 'desc' },
    take: 100,
  })
  return items.map(summaryOf)
}

export async function reviewQueue() {
  const revs = await prisma.contentRevision.findMany({
    where: { state: 'AWAITING_CORE_APPROVAL' },
    orderBy: { submittedAt: 'asc' },
    include: { item: { include: { members: { include: { person: true } } } } },
    take: 100,
  })
  return revs.map((r) => ({
    itemId: r.itemId, kind: r.item.kind, title: r.title, revision: r.number,
    isRevision: !!r.item.publishedRevisionId, submittedAt: r.submittedAt,
    contributors: r.item.members.map((m) => m.person.displayName),
  }))
}

export async function pendingInvitations(a: AuthContext) {
  const invs = await prisma.contentInvitation.findMany({ where: { inviteePersonId: a.personId, status: 'PENDING' }, orderBy: { createdAt: 'desc' } })
  const items = await prisma.contentItem.findMany({ where: { id: { in: invs.map((i) => i.itemId) } }, include: itemInclude })
  return invs.flatMap((i) => {
    const item = items.find((x) => x.id === i.itemId)
    if (!item) return []
    const inviter = item.members.find((m) => m.role === 'OWNER')?.person.displayName
    return [{ id: i.id, itemId: i.itemId, kind: item.kind, title: summaryOf(item).title, from: inviter ?? 'A member', createdAt: i.createdAt }]
  })
}
