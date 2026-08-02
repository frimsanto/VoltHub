import { AsyncLocalStorage } from 'async_hooks';
import { Request } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../config/database';

/**
 * Audit Trail helper built on top of the existing ActivityLog table.
 *
 * Design notes:
 *  - No new table is introduced; every audit record is an `activity_logs` row.
 *  - ipAddress / userAgent are captured per-request via AsyncLocalStorage so
 *    that service-layer code (which only receives a userId) can still record
 *    them without threading the Express `req` object through every signature.
 *  - `recordAudit` accepts an optional Prisma transaction client. When a client
 *    is supplied the write participates in the caller's transaction (atomic with
 *    the audited mutation, errors propagate). When omitted it writes through the
 *    shared prisma client and swallows errors so audit logging can never break
 *    a request that has otherwise succeeded (used for login/logout).
 */

// These mirror the Prisma enums (ActivityAction / activity_logs_entityType).
// Kept as string unions so the helper has no hard dependency on generated enum
// objects; Prisma accepts the matching string literals for enum columns.
export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'SUBMIT'
  | 'VALIDATE'
  | 'REJECT'
  | 'EXPORT'
  | 'LOGIN'
  | 'LOGOUT'
  | 'DOWNLOAD';

export type AuditEntityType =
  | 'USER'
  | 'LAPORAN_AWAL'
  | 'LAPORAN_AKHIR'
  | 'RTUPP'
  | 'TEAM'
  | 'ATTACHMENT';

export interface AuditContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AuditEntry {
  userId: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string | null;
  /** Optional report back-references (kept in sync with existing usage). */
  laporanAwalId?: string | null;
  laporanAkhirId?: string | null;
  /** Arbitrary structured context. Objects are JSON-stringified. */
  details?: Record<string, unknown> | string | null;
  /** Override the request context (rarely needed). */
  ipAddress?: string | null;
  userAgent?: string | null;
}

type TxClient = Prisma.TransactionClient;

const auditStore = new AsyncLocalStorage<AuditContext>();

/**
 * Run `fn` with a request-scoped audit context. All async work spawned inside
 * (controllers + services) can read the context via getAuditContext().
 */
export const runWithAuditContext = <T>(ctx: AuditContext, fn: () => T): T =>
  auditStore.run(ctx, fn);

export const getAuditContext = (): AuditContext | undefined => auditStore.getStore();

/**
 * Extract client metadata from an Express request. Prefers the left-most
 * X-Forwarded-For entry (proxied deployments) and falls back to the socket.
 */
export const extractAuditContext = (req: Request): AuditContext => {
  const forwarded = req.headers['x-forwarded-for'];
  const forwardedIp =
    typeof forwarded === 'string'
      ? forwarded.split(',')[0]?.trim()
      : Array.isArray(forwarded)
      ? forwarded[0]
      : undefined;

  return {
    ipAddress: forwardedIp || req.ip || req.socket?.remoteAddress || null,
    userAgent: (req.headers['user-agent'] as string) || null,
  };
};

const serializeDetails = (details: AuditEntry['details']): string | null => {
  if (details == null) return null;
  if (typeof details === 'string') return details;
  try {
    return JSON.stringify(details);
  } catch {
    return null;
  }
};

/**
 * Write a single audit record.
 *
 * @param entry  The audit payload.
 * @param tx     Optional transaction client. Pass the `tx` from
 *               `prisma.$transaction(async (tx) => ...)` to make the audit
 *               write atomic with the audited mutation. Omit for standalone
 *               (best-effort) logging such as login/logout.
 */
export const recordAudit = async (entry: AuditEntry, tx?: TxClient): Promise<void> => {
  const ctx = getAuditContext();

  const data = {
    userId: entry.userId,
    action: entry.action as any,
    entityType: entry.entityType as any,
    entityId: entry.entityId ?? null,
    laporanAwalId: entry.laporanAwalId ?? null,
    laporanAkhirId: entry.laporanAkhirId ?? null,
    details: serializeDetails(entry.details),
    ipAddress: entry.ipAddress ?? ctx?.ipAddress ?? null,
    userAgent: entry.userAgent ?? ctx?.userAgent ?? null,
  };

  if (tx) {
    // Transactional: let errors propagate so the whole operation rolls back.
    await tx.activityLog.create({ data });
    return;
  }

  // Standalone / best-effort: never let an audit failure break the request.
  try {
    await prisma.activityLog.create({ data });
  } catch (err) {
    console.error('[audit] Failed to write activity log:', err);
  }
};
