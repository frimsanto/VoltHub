import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { successResponse } from '../../utils/response';
import { resolveRequestScope } from '../../utils/tenantScope';
import { bayService } from './bay.service';
import type { CreateBayInput, UpdateBayInput, ListBayQuery } from './bay.validation';

export class BayController {
  list = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const { data, meta } = await bayService.list(req.query as unknown as ListBayQuery, scope);
      successResponse(res, data, 'Bays retrieved successfully', 200, meta);
    } catch (err) {
      next(err);
    }
  };

  getById = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const bay = await bayService.getById(req.params.id, scope);
      successResponse(res, bay, 'Bay retrieved successfully');
    } catch (err) {
      next(err);
    }
  };

  create = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const bay = await bayService.create(req.body as CreateBayInput, req.user?.userId, scope);
      successResponse(res, bay, 'Bay created successfully', 201);
    } catch (err) {
      next(err);
    }
  };

  update = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const bay = await bayService.update(req.params.id, req.body as UpdateBayInput, req.user?.userId, scope);
      successResponse(res, bay, 'Bay updated successfully');
    } catch (err) {
      next(err);
    }
  };

  remove = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      await bayService.remove(req.params.id, req.user?.userId, scope);
      successResponse(res, null, 'Bay deleted successfully');
    } catch (err) {
      next(err);
    }
  };
}

export const bayController = new BayController();
