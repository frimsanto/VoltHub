import { Prisma, WorkflowState } from '@prisma/client';
import prisma from '../../config/database';
import type { ListTransitionsQuery } from './workflow.validation';

const performerSelect = { select: { id: true, name: true, email: true, role: true } };

/**
 * Workflow Repository — persistence for `workflow_instances` and the append-only
 * `workflow_transitions` log. The state change + transition row are written in a
 * single transaction by `applyTransition` so an instance can never advance
 * without its audit trail (and vice versa).
 */
export class WorkflowRepository {
  findInstance(entityType: string, entityId: string) {
    return prisma.workflowInstance.findUnique({
      where: { entityType_entityId: { entityType, entityId } },
    });
  }

  findInstanceById(id: string) {
    return prisma.workflowInstance.findUnique({ where: { id } });
  }

  createInstance(data: {
    entityType: string;
    entityId: string;
    currentState: WorkflowState;
    createdBy?: string | null;
  }) {
    return prisma.workflowInstance.create({ data });
  }

  /**
   * Atomically advance an instance's state and append the transition row.
   * Returns the refreshed instance plus the created transition.
   */
  async applyTransition(params: {
    instanceId: string;
    entityType: string;
    entityId: string;
    action: string;
    fromState: WorkflowState;
    toState: WorkflowState;
    performedBy?: string | null;
    performedByRole?: string | null;
    comment?: string | null;
    reason?: string | null;
  }) {
    return prisma.$transaction(async (tx) => {
      const instance = await tx.workflowInstance.update({
        where: { id: params.instanceId },
        data: { currentState: params.toState },
      });

      const transition = await tx.workflowTransition.create({
        data: {
          instanceId: params.instanceId,
          entityType: params.entityType,
          entityId: params.entityId,
          action: params.action,
          fromState: params.fromState,
          toState: params.toState,
          performedBy: params.performedBy ?? null,
          performedByRole: params.performedByRole ?? null,
          comment: params.comment ?? null,
          reason: params.reason ?? null,
        },
        include: { performer: performerSelect },
      });

      return { instance, transition };
    });
  }

  findTransitionsByEntity(entityType: string, entityId: string) {
    return prisma.workflowTransition.findMany({
      where: { entityType, entityId },
      orderBy: { performedAt: 'asc' },
      include: { performer: performerSelect },
    });
  }

  async listTransitions(query: ListTransitionsQuery) {
    const { page, limit, entityType, entityId, action } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.WorkflowTransitionWhereInput = {
      ...(entityType ? { entityType } : {}),
      ...(entityId ? { entityId } : {}),
      ...(action ? { action } : {}),
    };

    const [data, total] = await Promise.all([
      prisma.workflowTransition.findMany({
        where,
        skip,
        take: limit,
        orderBy: { performedAt: 'desc' },
        include: { performer: performerSelect },
      }),
      prisma.workflowTransition.count({ where }),
    ]);

    return { data, total, page, limit };
  }
}

export const workflowRepository = new WorkflowRepository();
