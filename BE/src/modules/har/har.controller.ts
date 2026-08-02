import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { successResponse } from '../../utils/response';
import { resolveRequestScope } from '../../utils/tenantScope';
import { harService } from './har.service';
import type {
  CreateHarReportInput,
  CreateHarDetailInput,
  UpdateHarDetailInput,
  ListHarQuery,
} from './har.validation';

export class HarController {
  list = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const { data, meta } = await harService.list(req.query as unknown as ListHarQuery, scope);
      successResponse(res, data, 'HAR reports retrieved successfully', 200, meta);
    } catch (err) {
      next(err);
    }
  };

  getById = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const report = await harService.getById(req.params.id, scope);
      successResponse(res, report, 'HAR report retrieved successfully');
    } catch (err) {
      next(err);
    }
  };

  create = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const report = await harService.create(req.body as CreateHarReportInput, req.user?.userId, scope);
      successResponse(res, report, 'HAR report created successfully', 201);
    } catch (err) {
      next(err);
    }
  };

  addDetail = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const detail = await harService.addDetail(
        req.params.id,
        req.body as CreateHarDetailInput,
        req.user?.userId,
        scope
      );
      successResponse(res, detail, 'HAR detail added successfully', 201);
    } catch (err) {
      next(err);
    }
  };

  updateDetail = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const detail = await harService.updateDetail(
        req.params.id,
        req.params.detailId,
        req.body as UpdateHarDetailInput,
        req.user?.userId,
        scope
      );
      successResponse(res, detail, 'HAR detail updated successfully');
    } catch (err) {
      next(err);
    }
  };

  removeDetail = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      await harService.removeDetail(req.params.id, req.params.detailId, scope);
      successResponse(res, null, 'HAR detail deleted successfully');
    } catch (err) {
      next(err);
    }
  };
}

export const harController = new HarController();
