import type { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { prisma, type Tx } from './prisma';

interface AuditEntry {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
  req?: Request;
}

/** Records a sensitive action for the admin audit trail. */
export function audit(entry: AuditEntry, db: Tx = prisma) {
  return db.auditLog.create({
    data: {
      actorId: entry.actorId ?? entry.req?.user?.id ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      metadata: entry.metadata,
      ip: entry.req?.ip ?? null,
    },
  });
}
