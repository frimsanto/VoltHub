import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { successResponse } from '../../utils/response';
import { assetCategoryService } from './asset-category.service';
import type {
  CreateAssetCategoryInput,
  UpdateAssetCategoryInput,
  ListAssetCategoryQuery,
} from './asset-category.validation';

export class AssetCategoryController {
  list = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { data, meta } = await assetCategoryService.list(
        req.query as unknown as ListAssetCategoryQuery
      );
      successResponse(res, data, 'Asset categories retrieved successfully', 200, meta);
    } catch (err) {
      next(err);
    }
  };

  getById = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const category = await assetCategoryService.getById(req.params.id);
      successResponse(res, category, 'Asset category retrieved successfully');
    } catch (err) {
      next(err);
    }
  };

  create = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const category = await assetCategoryService.create(
        req.body as CreateAssetCategoryInput,
        req.user?.userId
      );
      successResponse(res, category, 'Asset category created successfully', 201);
    } catch (err) {
      next(err);
    }
  };

  update = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const category = await assetCategoryService.update(
        req.params.id,
        req.body as UpdateAssetCategoryInput,
        req.user?.userId
      );
      successResponse(res, category, 'Asset category updated successfully');
    } catch (err) {
      next(err);
    }
  };

  remove = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      await assetCategoryService.remove(req.params.id, req.user?.userId);
      successResponse(res, null, 'Asset category deleted successfully');
    } catch (err) {
      next(err);
    }
  };
}

export const assetCategoryController = new AssetCategoryController();
