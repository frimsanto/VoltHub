import type { WorkOrderStatus } from '@prisma/client';
import { BusinessRuleError } from '../../utils/appError';

/**
 * Work Order lifecycle state machine (Operation Management System GI RTUPP1):
 *
 *   DRAFT → ASSIGNED → ON_PROGRESS → WAITING_APPROVAL → APPROVED → CLOSED
 *
 * REJECTED ("Tidak Sesuai") is a terminal state (WAITING_APPROVAL → REJECTED,
 * no way out) — a follow-up visit means creating a brand-new WO, not reopening
 * this one. There's also an admin REOPEN (CLOSED → ON_PROGRESS). Pure data +
 * guards (no DB) so the rules are unit-testable in isolation.
 */
export const WO_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  DRAFT: ['ASSIGNED', 'ON_PROGRESS'],
  ASSIGNED: ['ON_PROGRESS', 'DRAFT'],
  ON_PROGRESS: ['WAITING_APPROVAL', 'ASSIGNED'],
  WAITING_APPROVAL: ['APPROVED', 'REJECTED', 'ON_PROGRESS'],
  APPROVED: ['CLOSED', 'WAITING_APPROVAL'],
  REJECTED: [],
  CLOSED: ['ON_PROGRESS'],
};

/** True if `to` is reachable from `from` (a no-op self-transition is allowed). */
export function canTransition(from: WorkOrderStatus, to: WorkOrderStatus): boolean {
  if (from === to) return true;
  return WO_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Throw a BusinessRuleError if the transition is not allowed. */
export function assertTransition(from: WorkOrderStatus, to: WorkOrderStatus): void {
  if (!canTransition(from, to)) {
    throw new BusinessRuleError(`Transisi WO dari ${from} ke ${to} tidak diizinkan`);
  }
}
