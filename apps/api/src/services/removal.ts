import { Prisma } from '../generated/prisma/client.js'
import { prisma, type Tx } from '../db.js'
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js'
import type { AuthContext } from '../middleware/auth.js'
import { audit } from './audit.js'
import { notifyUsers } from './notify.js'

// Rule: removal passes only when approvals are STRICTLY more than 50% of the electorate.
// The electorate is snapshotted at creation: every active Core member except the target.
export const passes = (approvals: number, eligible: number) => approvals * 2 > eligible
// Once enough "no" votes make a majority impossible, the vote closes as rejected.
export const cannotPass = (rejections: number, eligible: number) => (eligible - rejections) * 2 <= eligible

export async function openRemoval(a: AuthContext, targetPersonId: string, reason?: string) {
  return prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { personId: targetPersonId }, include: { person: true } })
    if (!target || target.status !== 'ACTIVE') throw notFound('Member not found')
    if (target.id === a.userId) throw badRequest('You cannot start a removal vote about yourself')
    if (target.isAdmin) throw forbidden('Administrators cannot be removed by vote')
    const core = await tx.user.findMany({ where: { status: 'ACTIVE', role: 'CORE', id: { not: target.id } }, select: { id: true } })
    if (core.length === 0) throw conflict('There are no eligible voters')
    let req
    try {
      req = await tx.removalRequest.create({
        data: { targetUserId: target.id, initiatedById: a.userId, reason, electorate: core.map((c) => c.id), eligibleCount: core.length },
      })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw conflict('A removal vote for this member is already open')
      throw e
    }
    // The target is never notified: they are excluded from the electorate and never receive anything.
    await notifyUsers(tx, req.electorate, {
      type: 'removal.opened',
      title: `Removal vote opened for ${target.person.displayName}`,
      body: reason ? `Reason: ${reason}` : 'Please cast your vote in the management dashboard.',
      link: '/dashboard/management',
      dedupe: req.id,
    })
    await audit(tx, a.userId, 'removal.open', 'RemovalRequest', req.id, { target: target.id, eligible: core.length })
    return req.id
  })
}

export async function castVote(a: AuthContext, requestId: string, approve: boolean) {
  return prisma.$transaction(async (tx) => {
    // Row lock serialises concurrent votes so the tally and the decision are never inconsistent.
    await tx.$queryRaw`SELECT id FROM "RemovalRequest" WHERE id = ${requestId} FOR UPDATE`
    const req = await tx.removalRequest.findUnique({ where: { id: requestId } })
    if (!req) throw notFound('Vote not found')
    if (req.status !== 'OPEN') throw conflict('This vote is closed')
    if (!req.electorate.includes(a.userId)) throw forbidden('You are not eligible to vote on this')
    try {
      await tx.removalVote.create({ data: { requestId, voterId: a.userId, approve } })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw conflict('You have already voted')
      throw e
    }
    const votes = await tx.removalVote.findMany({ where: { requestId } })
    const yes = votes.filter((v) => v.approve).length
    const no = votes.length - yes
    if (passes(yes, req.eligibleCount)) {
      await executeRemoval(tx, req.id, req.targetUserId, req.electorate, yes, req.eligibleCount)
      return 'APPROVED' as const
    }
    if (cannotPass(no, req.eligibleCount)) {
      await tx.removalRequest.update({ where: { id: req.id }, data: { status: 'REJECTED', decidedAt: new Date() } })
      const target = await tx.user.findUnique({ where: { id: req.targetUserId }, include: { person: true } })
      await notifyUsers(tx, req.electorate, {
        type: 'removal.rejected',
        title: `Removal vote closed: ${target?.person.displayName ?? 'member'} stays`,
        body: `${no} of ${req.eligibleCount} voted against; the threshold cannot be reached.`,
        link: '/dashboard/management',
        dedupe: req.id,
      })
      await audit(tx, a.userId, 'removal.rejected', 'RemovalRequest', req.id, { yes, no, eligible: req.eligibleCount })
      return 'REJECTED' as const
    }
    return 'OPEN' as const
  })
}

async function executeRemoval(tx: Tx, requestId: string, targetUserId: string, electorate: string[], yes: number, eligible: number) {
  const target = await tx.user.findUniqueOrThrow({ where: { id: targetUserId }, include: { person: true } })
  await tx.removalRequest.update({ where: { id: requestId }, data: { status: 'APPROVED', decidedAt: new Date() } })
  await tx.user.update({ where: { id: targetUserId }, data: { status: 'REMOVED', role: 'MEMBER', isAdmin: false } })
  await tx.session.updateMany({ where: { userId: targetUserId, revokedAt: null }, data: { revokedAt: new Date() } })
  // Old profile data is deleted; the Person row (name + id) remains so history keeps its link.
  await tx.profile.deleteMany({ where: { userId: targetUserId } })
  await tx.notification.deleteMany({ where: { userId: targetUserId } })
  await tx.person.update({ where: { id: target.personId }, data: { removedAt: new Date() } })
  await tx.contentInvitation.updateMany({ where: { inviteePersonId: target.personId, status: 'PENDING' }, data: { status: 'DECLINED', respondedAt: new Date() } })
  await tx.contentJoinRequest.updateMany({ where: { requesterPersonId: target.personId, status: 'PENDING' }, data: { status: 'DECLINED', respondedAt: new Date() } })
  await notifyUsers(tx, electorate, {
    type: 'removal.approved',
    title: `${target.person.displayName} was removed from the team`,
    body: `${yes} of ${eligible} Core members voted in favour.`,
    link: '/dashboard/management',
    dedupe: requestId,
  })
  await audit(tx, null, 'removal.executed', 'RemovalRequest', requestId, { target: targetUserId, yes, eligible })
}

export async function listRemovals(a: AuthContext) {
  const rows = await prisma.removalRequest.findMany({
    // A Core member who is themselves the target never sees the vote.
    where: { targetUserId: { not: a.userId }, OR: [{ status: 'OPEN' }, { decidedAt: { gt: new Date(Date.now() - 30 * 86400_000) } }] },
    orderBy: { createdAt: 'desc' },
    include: { votes: true },
    take: 50,
  })
  const targets = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.targetUserId) } }, include: { person: true } })
  return rows.map((r) => ({
    id: r.id,
    target: { personId: targets.find((t) => t.id === r.targetUserId)?.personId, name: targets.find((t) => t.id === r.targetUserId)?.person.displayName },
    reason: r.reason,
    status: r.status,
    eligible: r.eligibleCount,
    yes: r.votes.filter((v) => v.approve).length,
    no: r.votes.filter((v) => !v.approve).length,
    myVote: r.votes.find((v) => v.voterId === a.userId)?.approve ?? null,
    canVote: r.status === 'OPEN' && r.electorate.includes(a.userId),
    createdAt: r.createdAt,
  }))
}
