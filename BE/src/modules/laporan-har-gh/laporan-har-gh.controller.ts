import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { successResponse } from '../../utils/response';
import { resolveRequestScope } from '../../utils/tenantScope';
import { laporanHarGhService, type Actor } from './laporan-har-gh.service';
import type {
  CreateLaporanHarGhInput,
  UpdateLaporanHarGhInput,
  DecideLaporanHarGhInput,
  ListLaporanHarGhQuery,
} from './laporan-har-gh.validation';

const actorOf = (req: AuthRequest): Actor => ({ userId: req.user?.userId, role: req.user?.role });

export class LaporanHarGhController {
  list = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const { data, meta } = await laporanHarGhService.list(
        req.query as unknown as ListLaporanHarGhQuery,
        actorOf(req),
        scope,
      );
      successResponse(res, data, 'Laporan HAR GH retrieved successfully', 200, meta);
    } catch (err) {
      next(err);
    }
  };

  getById = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const report = await laporanHarGhService.getById(req.params.id, actorOf(req), scope);
      successResponse(res, report, 'Laporan HAR GH retrieved successfully');
    } catch (err) {
      next(err);
    }
  };

  create = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const report = await laporanHarGhService.create(req.body as CreateLaporanHarGhInput, actorOf(req), scope);
      successResponse(res, report, 'Laporan HAR GH created successfully', 201);
    } catch (err) {
      next(err);
    }
  };

  update = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const report = await laporanHarGhService.update(req.params.id, req.body as UpdateLaporanHarGhInput, actorOf(req), scope);
      successResponse(res, report, 'Laporan HAR GH updated successfully');
    } catch (err) {
      next(err);
    }
  };

  submit = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const report = await laporanHarGhService.submit(req.params.id, actorOf(req), scope);
      successResponse(res, report, 'Laporan HAR GH dikirim untuk validasi');
    } catch (err) {
      next(err);
    }
  };

  decide = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const report = await laporanHarGhService.decide(req.params.id, req.body as DecideLaporanHarGhInput, actorOf(req), scope);
      successResponse(res, report, 'Status validasi Laporan HAR GH diperbarui');
    } catch (err) {
      next(err);
    }
  };
}

export const laporanHarGhController = new LaporanHarGhController();
