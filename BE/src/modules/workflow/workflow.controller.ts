import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { successResponse } from '../../utils/response';
import { workflowService, Actor } from './workflow.service';
import { TRANSITIONS, WORKFLOW_STATES, WORKFLOW_ACTORS } from './workflow.config';
import type {
  StartWorkflowInput,
  PerformActionInput,
  ListTransitionsQuery,
} from './workflow.validation';

const actorOf = (req: AuthRequest): Actor => ({
  userId: req.user?.userId,
  role: req.user?.role,
});

export class WorkflowController {
  /** Static description of the state machine (for clients / docs / debugging). */
  definition = async (_req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      successResponse(
        res,
        { states: WORKFLOW_STATES, actors: WORKFLOW_ACTORS, transitions: TRANSITIONS },
        'Workflow definition retrieved successfully'
      );
    } catch (err) {
      next(err);
    }
  };

  start = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const instance = await workflowService.ensureInstance(
        req.body as StartWorkflowInput,
        actorOf(req)
      );
      successResponse(res, instance, 'Workflow instance ready', 201);
    } catch (err) {
      next(err);
    }
  };

  status = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { entityType, entityId } = req.params;
      const result = await workflowService.getStatus(entityType, entityId, actorOf(req));
      successResponse(res, result, 'Workflow status retrieved successfully');
    } catch (err) {
      next(err);
    }
  };

  history = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { entityType, entityId } = req.params;
      const history = await workflowService.getHistory(entityType, entityId);
      successResponse(res, history, 'Workflow history retrieved successfully');
    } catch (err) {
      next(err);
    }
  };

  transition = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { entityType, entityId } = req.params;
      const result = await workflowService.performAction(
        entityType,
        entityId,
        req.body as PerformActionInput,
        actorOf(req)
      );
      successResponse(res, result, `Workflow ${result.toState}`, 200);
    } catch (err) {
      next(err);
    }
  };

  listTransitions = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { data, meta } = await workflowService.listTransitions(
        req.query as unknown as ListTransitionsQuery
      );
      successResponse(res, data, 'Workflow transitions retrieved successfully', 200, meta);
    } catch (err) {
      next(err);
    }
  };
}

export const workflowController = new WorkflowController();
