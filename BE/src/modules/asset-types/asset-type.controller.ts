import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { successResponse } from '../../utils/response';
import { assetTypeService } from './asset-type.service';
import type {
  CreateAssetTypeInput,
  UpdateAssetTypeInput,
  ListAssetTypeQuery,
} from './asset-type.validation';

export class AssetTypeController {
  list = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { data, meta } = await assetTypeService.list(req.query as unknown as ListAssetTypeQuery);
      successResponse(res, data, 'Asset types retrieved successfully', 200, meta);
    } catch (err) {
      next(err);
    }
  };

  getById = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const type = await assetTypeService.getById(req.params.id);
      successResponse(res, type, 'Asset type retrieved successfully');
    } catch (err) {
      next(err);
    }
  };

  create = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const type = await assetTypeService.create(req.body as CreateAssetTypeInput, req.user?.userId);
      successResponse(res, type, 'Asset type created successfully', 201);
    } catch (err) {
      next(err);
    }
  };

  update = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const type = await assetTypeService.update(
        req.params.id,
        req.body as UpdateAssetTypeInput,
        req.user?.userId
      );
      successResponse(res, type, 'Asset type updated successfully');
    } catch (err) {
      next(err);
    }
  };

  remove = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      await assetTypeService.remove(req.params.id, req.user?.userId);
      successResponse(res, null, 'Asset type deleted successfully');
    } catch (err) {
      next(err);
    }
  };
}

export const assetTypeController = new AssetTypeController();
