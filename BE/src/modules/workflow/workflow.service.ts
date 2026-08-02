import { WorkflowState as PrismaWorkflowState } from '@prisma/client';
import { workflowRepository, WorkflowRepository } from './workflow.repository';
import { evaluateTransition } from './workflow.guards';
import { recordWorkflowAudit } from './workflow.audit';
import { notificationDispatcher } from '../notifications/notification.dispatcher';
import {
  allowedActionsFor,
  isTerminal,
  type WorkflowAction,
  type WorkflowState,
} from './workflow.config';
import { NotFoundError, BusinessRuleError, ForbiddenError } from '../../utils/appError';
import type {
  StartWorkflowInput,
  PerformActionInput,
  ListTransitionsQuery,
} from './workflow.validation';

export interface Actor {
  userId?: string;
  role?: string | null;
}

/**
 * Workflow Service — orchestrates the approval lifecycle for any entity.
 *
 * Responsibilities:
 *   • lazily create a workflow instance on first use (backward compatible: an
 *     existing report with no instance is treated as DRAFT until one is started);
 *   • validate every transition through the pure guards before persisting;
 *   • persist state + transition atomically (repository) and mirror to the
 *     canonical audit trail;
 *   • expose the available actions for the caller's role so the UI stays in sync
 *     with the server-side rules.
 */
export class WorkflowService {
  constructor(private readonly repo: WorkflowRepository = workflowRepository) {}

  /** Get an existing instance or create one (idempotent on entityType+entityId). */
  async ensureInstance(input: StartWorkflowInput, actor: Actor) {
    const existing = await this.repo.findInstance(input.entityType, input.entityId);
    if (existing) return existing;
    return this.repo.createInstance({
      entityType: input.entityType,
      entityId: input.entityId,
      currentState: input.initialState as PrismaWorkflowState,
      createdBy: actor.userId ?? null,
    });
  }

  /**
   * Read the current status of an entity's workflow, including the actions the
   * caller may perform next and the full transition history.
   */
  async getStatus(entityType: string, entityId: string, actor: Actor) {
    const instance = await this.repo.findInstance(entityType, entityId);
    if (!instance) throw new NotFoundError('No workflow found for this entity');

    const history = await this.repo.findTransitionsByEntity(entityType, entityId);
    const currentState = instance.currentState as WorkflowState;

    return {
      instance,
      currentState,
      isTerminal: isTerminal(currentState),
      availableActions: allowedActionsFor(currentState, actor.role).map((t) => ({
        action: t.action,
        label: t.label,
        to: t.to,
        reasonRequired: !!t.reasonRequired,
      })),
      history,
    };
  }

  async getHistory(entityType: string, entityId: string) {
    const history = await this.repo.findTransitionsByEntity(entityType, entityId);
    return history;
  }

  async listTransitions(query: ListTransitionsQuery) {
    const { data, total, page, limit } = await this.repo.listTransitions(query);
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  /**
   * Perform a workflow action on an entity. Creates the instance on demand
   * (first SUBMIT from an implicit DRAFT) so callers don't need a separate
   * "start" step. Throws an AppError subclass on any guard failure.
   */
  async performAction(
    entityType: string,
    entityId: string,
    input: PerformActionInput,
    actor: Actor
  ) {
    const instance =
      (await this.repo.findInstance(entityType, entityId)) ??
      (await this.repo.createInstance({
        entityType,
        entityId,
        currentState: 'DRAFT',
        createdBy: actor.userId ?? null,
      }));

    const fromState = instance.currentState as WorkflowState;
    const action = input.action as WorkflowAction;

    const guard = evaluateTransition({
      action,
      fromState,
      role: actor.role,
      reason: input.reason,
    });

    if (!guard.ok) {
      // Role failures are 403; everything else is a business-rule (422) violation.
      if (guard.code === 'FORBIDDEN_ROLE') throw new ForbiddenError(guard.message);
      throw new BusinessRuleError(guard.message);
    }

    const toState = guard.transition.to;

    const { instance: updated, transition } = await this.repo.applyTransition({
      instanceId: instance.id,
      entityType,
      entityId,
      action,
      fromState: fromState as PrismaWorkflowState,
      toState: toState as PrismaWorkflowState,
      performedBy: actor.userId ?? null,
      performedByRole: actor.role ?? null,
      comment: input.comment ?? null,
      reason: input.reason ?? null,
    });

    // Mirror to canonical audit_logs (best-effort, never blocks the response).
    await recordWorkflowAudit({
      entityType,
      entityId,
      action,
      fromState,
      toState,
      performedBy: actor.userId ?? null,
      performedByRole: actor.role ?? null,
      comment: input.comment ?? null,
      reason: input.reason ?? null,
    });

    // Fire report-lifecycle notifications (submit/approve/reject/request_revision).
    // Best-effort & non-blocking — recipient resolution lives in the dispatcher.
    notificationDispatcher.reportWorkflow({
      action,
      entityType,
      entityId,
      ownerId: instance.createdBy,
      actorId: actor.userId ?? null,
      reason: input.reason ?? null,
      transitionId: transition.id,
    });

    return { instance: updated, transition, fromState, toState };
  }
}

export const workflowService = new WorkflowService();
