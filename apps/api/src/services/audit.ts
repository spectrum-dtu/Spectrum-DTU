import type { Db } from '../db.js'

export async function audit(
  db: Db,
  actorId: string | null,
  action: string,
  entityType?: string,
  entityId?: string,
  meta?: Record<string, unknown>,
) {
  await db.auditLog.create({
    data: { actorId, action, entityType, entityId, meta: meta as object | undefined },
  })
}
