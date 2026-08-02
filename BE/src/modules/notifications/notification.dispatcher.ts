import { NotificationType } from '@prisma/client';
import { notificationService } from './notification.service';
import { notificationRepository } from './notification.repository';

/**
 * Notification Dispatcher — the seam between business modules and the
 * notification system. Domain services (tickets, workflow) call these helpers;
 * each resolves the recipients for an event and hands off to the service.
 *
 * Every helper is best-effort and self-contained: it catches its own errors so a
 * notification failure can never roll back or break the triggering transaction.
 * Callers do NOT need to await for correctness (but awaiting is harmless).
 */

/** Map the 4 report-related workflow actions to their notification type. */
const WORKFLOW_ACTION_EVENT: Partial<Record<string, NotificationType>> = {
  SUBMIT: 'REPORT_SUBMITTED',
  APPROVE: 'REPORT_APPROVED',
  REJECT: 'REPORT_REJECTED',
  REQUEST_REVISION: 'REVISION_REQUESTED',
};

const safe = (fn: () => Promise<unknown>): void => {
  fn().catch((err) => console.error('[notification.dispatcher] failed:', err));
};

const without = (ids: (string | null | undefined)[], exclude?: string | null): string[] =>
  ids.filter((id): id is string => !!id && id !== exclude);

export const notificationDispatcher = {
  /** New task/ticket assigned to a field officer. */
  taskAssigned(params: {
    assigneeId: string;
    actorId?: string | null;
    entityType: string;
    entityId: string;
    ref?: string | null;
    detail?: string | null;
  }): void {
    const recipients = without([params.assigneeId], params.actorId);
    if (recipients.length === 0) return; // self-assignment → no notification
    safe(() =>
      notificationService.notify({
        type: 'TASK_ASSIGNED',
        recipientIds: recipients,
        entityType: params.entityType,
        entityId: params.entityId,
        dedupeDiscriminator: params.assigneeId,
        context: { ref: params.ref, detail: params.detail, entityType: params.entityType },
      })
    );
  },

  /** A report changed workflow state (submit/approve/reject/request_revision). */
  reportWorkflow(params: {
    action: string;
    entityType: string;
    entityId: string;
    /** The report owner (workflow instance creator) — recipient for decisions. */
    ownerId?: string | null;
    actorId?: string | null;
    actorName?: string | null;
    reason?: string | null;
    ref?: string | null;
    /** Unique transition id — keeps repeated state changes from being deduped. */
    transitionId?: string | null;
  }): void {
    const type = WORKFLOW_ACTION_EVENT[params.action];
    if (!type) return; // REVIEW / CLOSE etc. carry no notification

    safe(async () => {
      // SUBMITTED notifies the reviewers (admins); decisions notify the owner.
      const recipientIds =
        type === 'REPORT_SUBMITTED'
          ? without(await notificationRepository.findAdminUserIds(), params.actorId)
          : without([params.ownerId], params.actorId);

      if (recipientIds.length === 0) return;

      await notificationService.notify({
        type,
        recipientIds,
        entityType: params.entityType,
        entityId: params.entityId,
        dedupeDiscriminator: params.transitionId ?? params.action,
        context: {
          ref: params.ref,
          actorName: params.actorName,
          reason: params.reason,
          entityType: params.entityType,
        },
      });
    });
  },

  /** A work order (or task) was assigned to a whole team — notify every member. */
  taskAssignedTeam(params: {
    recipientIds: string[];
    actorId?: string | null;
    entityType: string;
    entityId: string;
    ref?: string | null;
    detail?: string | null;
  }): void {
    const recipients = without(params.recipientIds, params.actorId);
    if (recipients.length === 0) return;
    safe(() =>
      notificationService.notify({
        type: 'TASK_ASSIGNED',
        recipientIds: recipients,
        entityType: params.entityType,
        entityId: params.entityId,
        dedupeDiscriminator: params.entityId,
        context: { ref: params.ref, detail: params.detail, entityType: params.entityType },
      })
    );
  },

  /** A work order changed workflow state (submit/approve/reject). */
  workOrderWorkflow(params: {
    action: 'SUBMIT' | 'APPROVE' | 'REJECT';
    workOrderId: string;
    woNumber: string;
    rtuppId?: string | null;
    ownerIds?: string[]; // team members of the assigned team
    actorId?: string | null;
    reason?: string | null;
  }): void {
    const type = WORKFLOW_ACTION_EVENT[params.action];
    if (!type) return;

    safe(async () => {
      let recipientIds: string[] = [];
      if (type === 'REPORT_SUBMITTED') {
        if (params.rtuppId) {
          recipientIds = without(await notificationRepository.findAdminUserIdsByRtupp(params.rtuppId), params.actorId);
        } else {
          recipientIds = without(await notificationRepository.findAdminUserIds(), params.actorId);
        }
      } else {
        recipientIds = without(params.ownerIds ?? [], params.actorId);
      }

      if (recipientIds.length === 0) return;

      await notificationService.notify({
        type,
        recipientIds,
        entityType: 'WorkOrder',
        entityId: params.workOrderId,
        dedupeDiscriminator: params.action,
        context: {
          ref: params.woNumber,
          reason: params.reason,
          entityType: 'WorkOrder',
        },
      });
    });
  },

  /** A Laporan GI changed workflow state (submit → admin RTUPP; decide → pelapor). */
  giReportWorkflow(params: {
    action: 'SUBMIT' | 'APPROVE' | 'REJECT';
    reportId: string;
    ref?: string | null;
    rtuppId?: string | null;
    ownerId?: string | null; // inspector (pelapor) ID
    actorId?: string | null;
    reason?: string | null;
  }): void {
    const type = WORKFLOW_ACTION_EVENT[params.action];
    if (!type) return;

    safe(async () => {
      let recipientIds: string[];
      if (type === 'REPORT_SUBMITTED') {
        recipientIds = without(
          params.rtuppId
            ? await notificationRepository.findAdminUserIdsByRtupp(params.rtuppId)
            : await notificationRepository.findAdminUserIds(),
          params.actorId,
        );
      } else {
        recipientIds = without([params.ownerId], params.actorId);
      }

      if (recipientIds.length === 0) return;

      await notificationService.notify({
        type,
        recipientIds,
        entityType: 'LaporanGi',
        entityId: params.reportId,
        dedupeDiscriminator: params.action,
        context: { ref: params.ref, reason: params.reason, entityType: 'LaporanGi' },
      });
    });
  },

  /** A service/maintenance ticket was created. */
  ticketCreated(params: {
    ticketId: string;
    ticketNumber: string;
    assignedTo?: string | null;
    actorId?: string | null;
    detail?: string | null;
  }): void {
    safe(async () => {
      // Notify the assignee if set, otherwise the admin pool for triage.
      const recipientIds = params.assignedTo
        ? without([params.assignedTo], params.actorId)
        : without(await notificationRepository.findAdminUserIds(), params.actorId);
      if (recipientIds.length === 0) return;

      await notificationService.notify({
        type: 'TICKET_CREATED',
        recipientIds,
        entityType: 'Ticket',
        entityId: params.ticketId,
        dedupeDiscriminator: 'created',
        context: { ref: params.ticketNumber, detail: params.detail },
      });

      // If the ticket was created already-assigned, the assignee also gets the
      // dedicated "task assigned" notification.
      if (params.assignedTo) {
        notificationDispatcher.taskAssigned({
          assigneeId: params.assignedTo,
          actorId: params.actorId,
          entityType: 'Ticket',
          entityId: params.ticketId,
          ref: params.ticketNumber,
          detail: params.detail,
        });
      }
    });
  },

  /** A ticket was closed. */
  ticketClosed(params: {
    ticketId: string;
    ticketNumber: string;
    assignedTo?: string | null;
    actorId?: string | null;
  }): void {
    safe(async () => {
      const recipientIds = params.assignedTo
        ? without([params.assignedTo], params.actorId)
        : without(await notificationRepository.findAdminUserIds(), params.actorId);
      if (recipientIds.length === 0) return;

      await notificationService.notify({
        type: 'TICKET_CLOSED',
        recipientIds,
        entityType: 'Ticket',
        entityId: params.ticketId,
        dedupeDiscriminator: 'closed',
        context: { ref: params.ticketNumber },
      });
    });
  },
};
