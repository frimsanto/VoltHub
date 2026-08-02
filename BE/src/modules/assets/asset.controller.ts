import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { successResponse } from '../../utils/response';
import { resolveRequestScope } from '../../utils/tenantScope';
import { assetService } from './asset.service';
import type { CreateAssetInput, UpdateAssetInput, ListAssetQuery } from './asset.validation';

export class AssetController {
  list = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const { data, meta } = await assetService.list(req.query as unknown as ListAssetQuery, scope);
      successResponse(res, data, 'Assets retrieved successfully', 200, meta);
    } catch (err) {
      next(err);
    }
  };

  // GET /assets/scada/summary — live RTU UP/DOWN snapshot for the monitoring dashboard.
  scadaSummary = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const summary = await assetService.scadaRtuSummary(scope);
      successResponse(res, summary, 'SCADA RTU summary retrieved successfully');
    } catch (err) {
      next(err);
    }
  };

  getById = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const asset = await assetService.getById(req.params.id, scope);
      successResponse(res, asset, 'Asset retrieved successfully');
    } catch (err) {
      next(err);
    }
  };

  create = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const asset = await assetService.create(req.body as CreateAssetInput, req.user?.userId, scope);
      successResponse(res, asset, 'Asset created successfully', 201);
    } catch (err) {
      next(err);
    }
  };

  update = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const asset = await assetService.update(req.params.id, req.body as UpdateAssetInput, req.user?.userId, scope);
      successResponse(res, asset, 'Asset updated successfully');
    } catch (err) {
      next(err);
    }
  };

  remove = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      await assetService.remove(req.params.id, req.user?.userId, scope);
      successResponse(res, null, 'Asset deleted successfully');
    } catch (err) {
      next(err);
    }
  };
}

export const assetController = new AssetController();
