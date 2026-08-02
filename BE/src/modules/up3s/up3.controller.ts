import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { successResponse } from '../../utils/response';
import { up3Service } from './up3.service';
import type { CreateUp3Input, UpdateUp3Input, ListUp3Query } from './up3.validation';

export class Up3Controller {
  list = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { data, meta } = await up3Service.list(req.query as unknown as ListUp3Query);
      successResponse(res, data, 'UP3 list retrieved successfully', 200, meta);
    } catch (err) {
      next(err);
    }
  };

  getById = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const up3 = await up3Service.getById(req.params.id);
      successResponse(res, up3, 'UP3 retrieved successfully');
    } catch (err) {
      next(err);
    }
  };

  create = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const up3 = await up3Service.create(req.body as CreateUp3Input, req.user?.userId);
      successResponse(res, up3, 'UP3 created successfully', 201);
    } catch (err) {
      next(err);
    }
  };

  update = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const up3 = await up3Service.update(req.params.id, req.body as UpdateUp3Input, req.user?.userId);
      successResponse(res, up3, 'UP3 updated successfully');
    } catch (err) {
      next(err);
    }
  };

  remove = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      await up3Service.remove(req.params.id, req.user?.userId);
      successResponse(res, null, 'UP3 deleted successfully');
    } catch (err) {
      next(err);
    }
  };
}

export const up3Controller = new Up3Controller();
