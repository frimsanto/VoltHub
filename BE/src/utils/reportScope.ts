import prisma from '../config/database';
import { hasGlobalScope, isMaster } from '../auth/roles';

/**
 * Per-RTUPP access guard for a single report.
 *
 * A report's RTUPP is its creator's RTUPP. MASTER, ADMIN (global data access,
 * 2026-07 policy) and the global Manager UP3 (MANAGER + rtuppId null) bypass
 * the check; ASMEN (MANAGER + rtuppId) may only act on reports whose creator
 * belongs to their own RTUPP. Fails closed: an operator with no RTUPP, or one
 * whose RTUPP differs from the report's, is denied. PETUGAS is handled by the
 * caller's "own records only" branch and should not be passed here.
 *
 * Throws `Error('Access denied')` (mapped to HTTP 403 by the controllers).
 */
export async function assertReportRtuppAccess(
  operatorId: string,
  operatorRole: string,
  reportCreatorRtuppId: string | null | undefined
): Promise<void> {
  if (isMaster(operatorRole)) return; // MASTER → all RTUPPs (audit read)
  const op = await prisma.user.findUnique({
    where: { id: operatorId },
    select: { rtuppId: true },
  });
  if (hasGlobalScope(operatorRole, op?.rtuppId)) return; // ADMIN / Manager UP3 → global
  if (!op?.rtuppId || op.rtuppId !== reportCreatorRtuppId) {
    throw new Error('Access denied');
  }
}
