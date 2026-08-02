/**
 * Workflow Audit Service.
 *
 * The `workflow_transitions` table is itself the primary, immutable audit trail
 * for the approval lifecycle (it records actor, role, from/to, comment, reason,
 * timestamp). This helper additionally mirrors every transition into the
 * canonical `audit_logs` table (BR-018) so workflow activity shows up alongside
 * all other entity changes in the central audit view, without coupling the
 * workflow service to the audit-log write format.
 */

import { recordAuditLog } from '../../utils/auditLog';
import type { WorkflowState, WorkflowAction } from './workflow.config';

export interface WorkflowAuditEntry {
  entityType: string;
  entityId: string;
  action: WorkflowAction;
  fromState: WorkflowState;
  toState: WorkflowState;
  performedBy?: string | null;
  performedByRole?: string | null;
  comment?: string | null;
  reason?: string | null;
}

export const recordWorkflowAudit = async (entry: WorkflowAuditEntry): Promise<void> => {
  await recordAuditLog({
    entityType: `Workflow:${entry.entityType}`,
    entityId: entry.entityId,
    action: 'STATUS_CHANGE',
    oldValue: { state: entry.fromState },
    newValue: {
      state: entry.toState,
      action: entry.action,
      role: entry.performedByRole,
      comment: entry.comment ?? undefined,
      reason: entry.reason ?? undefined,
    },
    performedBy: entry.performedBy ?? null,
  });
};
