import { z } from 'zod';
import { WORKFLOW_ACTIONS, WORKFLOW_STATES } from './workflow.config';

/** entityType is an open string (any domain entity can carry a workflow). */
const entityTypeSchema = z.string().trim().min(1).max(100);
const entityIdSchema = z.string().trim().min(1).max(36);

export const startWorkflowSchema = z.object({
  entityType: entityTypeSchema,
  entityId: entityIdSchema,
  initialState: z.enum(WORKFLOW_STATES).optional().default('DRAFT'),
});

export const performActionSchema = z.object({
  action: z.enum(WORKFLOW_ACTIONS),
  /** Approval/contextual note attached to the transition. */
  comment: z.string().trim().max(2000).optional().nullable(),
  /** Mandatory free-text for REJECT / REQUEST_REVISION (enforced by the guard). */
  reason: z.string().trim().max(2000).optional().nullable(),
});

export const entityParamsSchema = z.object({
  entityType: entityTypeSchema,
  entityId: entityIdSchema,
});

export const listTransitionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  entityType: entityTypeSchema.optional(),
  entityId: entityIdSchema.optional(),
  action: z.enum(WORKFLOW_ACTIONS).optional(),
});

export type StartWorkflowInput = z.infer<typeof startWorkflowSchema>;
export type PerformActionInput = z.infer<typeof performActionSchema>;
export type EntityParams = z.infer<typeof entityParamsSchema>;
export type ListTransitionsQuery = z.infer<typeof listTransitionsQuerySchema>;
