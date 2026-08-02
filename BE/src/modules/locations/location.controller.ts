import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { successResponse } from '../../utils/response';
import { resolveRequestScope } from '../../utils/tenantScope';
import { locationService } from './location.service';
import type {
  CreateLocationInput,
  UpdateLocationInput,
  ListLocationQuery,
  VerifyCoordinatesInput,
} from './location.validation';

/**
 * Location Controller — HTTP glue only. Validation happens in middleware,
 * business logic lives in the service, errors bubble to the global handler.
 */
export class LocationController {
  list = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const { data, meta } = await locationService.list(req.query as unknown as ListLocationQuery, scope);
      successResponse(res, data, 'Locations retrieved successfully', 200, meta);
    } catch (err) {
      next(err);
    }
  };

  getById = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const location = await locationService.getById(req.params.id, scope);
      successResponse(res, location, 'Location retrieved successfully');
    } catch (err) {
      next(err);
    }
  };

  create = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const location = await locationService.create(req.body as CreateLocationInput, req.user?.userId, scope);
      successResponse(res, location, 'Location created successfully', 201);
    } catch (err) {
      next(err);
    }
  };

  update = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const location = await locationService.update(
        req.params.id,
        req.body as UpdateLocationInput,
        req.user?.userId,
        scope
      );
      successResponse(res, location, 'Location updated successfully');
    } catch (err) {
      next(err);
    }
  };

  remove = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      await locationService.remove(req.params.id, req.user?.userId, scope);
      successResponse(res, null, 'Location deleted successfully');
    } catch (err) {
      next(err);
    }
  };

  verifyCoordinates = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const location = await locationService.verifyCoordinates(
        req.params.id,
        req.body as VerifyCoordinatesInput,
        req.user?.userId,
        scope
      );
      const message =
        (req.body as VerifyCoordinatesInput).result === 'CORRECTED'
          ? 'Koordinat gardu diperbarui'
          : 'Lokasi gardu dikonfirmasi sesuai';
      successResponse(res, location, message);
    } catch (err) {
      next(err);
    }
  };
}

export const locationController = new LocationController();
