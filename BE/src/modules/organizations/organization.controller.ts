import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { successResponse } from '../../utils/response';
import { organizationService } from './organization.service';
import type {
  CreateOrganizationInput,
  UpdateOrganizationInput,
  ListOrganizationQuery,
} from './organization.validation';

export class OrganizationController {
  list = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { data, meta } = await organizationService.list(
        req.query as unknown as ListOrganizationQuery
      );
      successResponse(res, data, 'Organizations retrieved successfully', 200, meta);
    } catch (err) {
      next(err);
    }
  };

  getById = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const org = await organizationService.getById(req.params.id);
      successResponse(res, org, 'Organization retrieved successfully');
    } catch (err) {
      next(err);
    }
  };

  create = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const org = await organizationService.create(req.body as CreateOrganizationInput, req.user?.userId);
      successResponse(res, org, 'Organization created successfully', 201);
    } catch (err) {
      next(err);
    }
  };

  update = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const org = await organizationService.update(
        req.params.id,
        req.body as UpdateOrganizationInput,
        req.user?.userId
      );
      successResponse(res, org, 'Organization updated successfully');
    } catch (err) {
      next(err);
    }
  };

  remove = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      await organizationService.remove(req.params.id, req.user?.userId);
      successResponse(res, null, 'Organization deleted successfully');
    } catch (err) {
      next(err);
    }
  };
}

export const organizationController = new OrganizationController();
