import { Prisma } from '@prisma/client';
import prisma from '../config/database';

/**
 * Canonical audit-trail helper for the Gardu-centric (V2) domain.
 *
 * Writes to the `audit_logs` table (model AuditLog) — the canonical, immutable
 * trail defined in docs/05_ERD §11 / docs/10_DATA_DICTIONARY (AUDIT_LOG) and
 * required by BR-D02 ("all data changes must be written to audit_logs") and
 * BR-008 (asset move must be audited). This is distinct from the legacy
 * `activity_logs` table used by V1 (see src/utils/audit.ts).
 *
 * Per BR-018 audit rows are append-only: this module never exposes update or
 * delete. Failures are swallowed so audit logging can never break a request
 * that has otherwise succeeded (unless written inside a caller transaction).
 */

export type CanonicalAuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'STATUS_CHANGE';

export interface AuditLogEntry {
  entityType: string;
  entityId: string;
  action: CanonicalAuditAction;
  oldValue?: unknown;
  newValue?: unknown;
  performedBy?: string | null;
}

const serialize = (value: unknown): string | null => {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
};

type TxClient = Prisma.TransactionClient;

export const recordAuditLog = async (entry: AuditLogEntry, tx?: TxClient): Promise<void> => {
  const data = {
    entityType: entry.entityType,
    entityId: entry.entityId,
    action: entry.action,
    oldValue: serialize(entry.oldValue),
    newValue: serialize(entry.newValue),
    performedBy: entry.performedBy ?? null,
  };

  if (tx) {
    await tx.auditLog.create({ data });
    return;
  }

  try {
    await prisma.auditLog.create({ data });
  } catch (err) {
    console.error('[auditLog] Failed to write audit_logs row:', err);
  }
};
