import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { successResponse } from '../../utils/response';
import { feederService } from './feeder.service';
import type { CreateFeederInput, UpdateFeederInput, ListFeederQuery } from './feeder.validation';

export class FeederController {
  list = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { data, meta } = await feederService.list(req.query as unknown as ListFeederQuery);
      successResponse(res, data, 'Feeders retrieved successfully', 200, meta);
    } catch (err) {
      next(err);
    }
  };

  getById = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const feeder = await feederService.getById(req.params.id);
      successResponse(res, feeder, 'Feeder retrieved successfully');
    } catch (err) {
      next(err);
    }
  };

  create = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const feeder = await feederService.create(req.body as CreateFeederInput, req.user?.userId);
      successResponse(res, feeder, 'Feeder created successfully', 201);
    } catch (err) {
      next(err);
    }
  };

  update = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const feeder = await feederService.update(req.params.id, req.body as UpdateFeederInput, req.user?.userId);
      successResponse(res, feeder, 'Feeder updated successfully');
    } catch (err) {
      next(err);
    }
  };

  remove = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      await feederService.remove(req.params.id, req.user?.userId);
      successResponse(res, null, 'Feeder deleted successfully');
    } catch (err) {
      next(err);
    }
  };
}

export const feederController = new FeederController();
