import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import type { ListAuditLogQuery } from './audit-log.validation';

/**
 * Audit Log Repository — read access for the canonical `audit_logs` table.
 * Exposes NO write methods: audit rows are append-only and written exclusively
 * by src/utils/auditLog.ts (BR-018 immutability is structurally enforced here).
 */
export class AuditLogRepository {
  async findAll(query: ListAuditLogQuery) {
    const { page, limit, entityType, entityId, action, performedBy, dateFrom, dateTo } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {
      ...(entityType ? { entityType } : {}),
      ...(entityId ? { entityId } : {}),
      ...(action ? { action } : {}),
      ...(performedBy ? { performedBy } : {}),
      ...(dateFrom || dateTo
        ? {
            performedAt: {
              ...(dateFrom ? { gte: dateFrom } : {}),
              ...(dateTo ? { lte: dateTo } : {}),
            },
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { performedAt: 'desc' },
        include: { performer: { select: { id: true, name: true, email: true, role: true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  findById(id: string) {
    return prisma.auditLog.findUnique({
      where: { id },
      include: { performer: { select: { id: true, name: true, email: true, role: true } } },
    });
  }
}

export const auditLogRepository = new AuditLogRepository();
