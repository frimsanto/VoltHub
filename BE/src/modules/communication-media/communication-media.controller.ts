import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { successResponse } from '../../utils/response';
import { resolveRequestScope } from '../../utils/tenantScope';
import { communicationMediaService } from './communication-media.service';
import type {
  CreateCommunicationMediaInput,
  UpdateCommunicationMediaInput,
  ListCommunicationMediaQuery,
} from './communication-media.validation';

export class CommunicationMediaController {
  list = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const { data, meta } = await communicationMediaService.list(
        req.query as unknown as ListCommunicationMediaQuery,
        scope
      );
      successResponse(res, data, 'Communication media retrieved successfully', 200, meta);
    } catch (err) {
      next(err);
    }
  };

  getById = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const media = await communicationMediaService.getById(req.params.id, scope);
      successResponse(res, media, 'Communication media retrieved successfully');
    } catch (err) {
      next(err);
    }
  };

  create = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const media = await communicationMediaService.create(
        req.body as CreateCommunicationMediaInput,
        req.user?.userId,
        scope
      );
      successResponse(res, media, 'Communication media created successfully', 201);
    } catch (err) {
      next(err);
    }
  };

  update = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const media = await communicationMediaService.update(
        req.params.id,
        req.body as UpdateCommunicationMediaInput,
        req.user?.userId,
        scope
      );
      successResponse(res, media, 'Communication media updated successfully');
    } catch (err) {
      next(err);
    }
  };

  remove = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      await communicationMediaService.remove(req.params.id, req.user?.userId, scope);
      successResponse(res, null, 'Communication media deleted successfully');
    } catch (err) {
      next(err);
    }
  };
}

export const communicationMediaController = new CommunicationMediaController();
