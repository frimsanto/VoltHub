import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { successResponse } from '../../utils/response';
import { resolveRequestScope } from '../../utils/tenantScope';
import { performanceService } from './performance.service';
import type { ListPerformanceQuery, SummaryQuery } from './performance.validation';

export class PerformanceController {
  list = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const { data, meta } = await performanceService.list(
        req.query as unknown as ListPerformanceQuery,
        scope
      );
      successResponse(res, data, 'Performance records retrieved successfully', 200, meta);
    } catch (err) {
      next(err);
    }
  };

  summary = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const summary = await performanceService.summary(req.query as unknown as SummaryQuery, scope);
      successResponse(res, summary, 'Performance summary retrieved successfully');
    } catch (err) {
      next(err);
    }
  };

  getById = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const record = await performanceService.getById(req.params.id, scope);
      successResponse(res, record, 'Performance record retrieved successfully');
    } catch (err) {
      next(err);
    }
  };
}

export const performanceController = new PerformanceController();
