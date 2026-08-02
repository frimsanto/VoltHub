import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { successResponse } from '../../utils/response';
import { resolveRequestScope } from '../../utils/tenantScope';
import { assetSimCardService } from './asset-sim-card.service';
import type { CreateSimCardInput, UpdateSimCardInput } from './asset-sim-card.validation';

export class AssetSimCardController {
  // GET /assets/:assetId/sim-cards
  listByAsset = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const data = await assetSimCardService.listByAsset(req.params.assetId, scope);
      successResponse(res, data, 'SIM cards retrieved successfully');
    } catch (err) {
      next(err);
    }
  };

  // POST /assets/:assetId/sim-cards
  create = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const sim = await assetSimCardService.create(
        req.params.assetId,
        req.body as CreateSimCardInput,
        req.user?.userId,
        scope
      );
      successResponse(res, sim, 'SIM card created successfully', 201);
    } catch (err) {
      next(err);
    }
  };

  // PUT /sim-cards/:id
  update = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const sim = await assetSimCardService.update(req.params.id, req.body as UpdateSimCardInput, req.user?.userId, scope);
      successResponse(res, sim, 'SIM card updated successfully');
    } catch (err) {
      next(err);
    }
  };

  // DELETE /sim-cards/:id
  remove = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      await assetSimCardService.remove(req.params.id, scope);
      successResponse(res, null, 'SIM card deleted successfully');
    } catch (err) {
      next(err);
    }
  };
}

export const assetSimCardController = new AssetSimCardController();
