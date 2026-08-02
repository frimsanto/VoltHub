import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import { validate } from '../../middlewares/validate';
import { ALL_ROLES, MONITOR_ROLES } from '../../auth/roles';
import { workflowController } from './workflow.controller';
import {
  startWorkflowSchema,
  performActionSchema,
  entityParamsSchema,
  listTransitionsQuerySchema,
} from './workflow.validation';

/**
 * Enterprise Approval Workflow routes (mounted at /api/v1/workflow).
 *
 * RBAC is intentionally permissive at the HTTP layer (any authenticated user)
 * because the *real* authorization is the per-action transition guard
 * (workflow.guards.ts): the state machine decides which enterprise actor — and
 * therefore which canonical role — may perform each action, returning 403 from
 * the service when not permitted. The admin-only audit listing is the one
 * endpoint gated here.
 */
const router = Router();
router.use(authenticate);

// State-machine definition (states, actors, transition table).
router.get('/definition', workflowController.definition);

// Cross-entity transition audit feed — read-only, so the monitoring tier
// (MASTER/MANAGER/ADMIN) may view it.
router.get(
  '/transitions',
  authorize(...MONITOR_ROLES),
  validate(listTransitionsQuerySchema, 'query'),
  workflowController.listTransitions
);

// Explicitly create/seed an instance (optional — actions auto-create one).
router.post(
  '/instances',
  authorize(...ALL_ROLES),
  validate(startWorkflowSchema),
  workflowController.start
);

// Per-entity status (current state + available actions for caller + history).
router.get(
  '/:entityType/:entityId',
  validate(entityParamsSchema, 'params'),
  workflowController.status
);

router.get(
  '/:entityType/:entityId/history',
  validate(entityParamsSchema, 'params'),
  workflowController.history
);

// Perform a workflow action (submit / review / request_revision / approve /
// reject / close). Guard enforces actor-role + valid-transition + reason rules.
router.post(
  '/:entityType/:entityId/transition',
  authorize(...ALL_ROLES),
  validate(entityParamsSchema, 'params'),
  validate(performActionSchema),
  workflowController.transition
);

export default router;
