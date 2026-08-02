import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { successResponse } from '../../utils/response';
import { resolveRequestScope } from '../../utils/tenantScope';
import { laporanHarGiService, type Actor } from './laporan-har-gi.service';
import type {
  CreateLaporanHarGiInput,
  UpdateLaporanHarGiInput,
  DecideLaporanHarGiInput,
  ListLaporanHarGiQuery,
} from './laporan-har-gi.validation';

const actorOf = (req: AuthRequest): Actor => ({ userId: req.user?.userId, role: req.user?.role });

export class LaporanHarGiController {
  list = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const { data, meta } = await laporanHarGiService.list(
        req.query as unknown as ListLaporanHarGiQuery,
        actorOf(req),
        scope,
      );
      successResponse(res, data, 'Laporan HAR GI retrieved successfully', 200, meta);
    } catch (err) {
      next(err);
    }
  };

  getById = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const report = await laporanHarGiService.getById(req.params.id, actorOf(req), scope);
      successResponse(res, report, 'Laporan HAR GI retrieved successfully');
    } catch (err) {
      next(err);
    }
  };

  create = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const report = await laporanHarGiService.create(req.body as CreateLaporanHarGiInput, actorOf(req), scope);
      successResponse(res, report, 'Laporan HAR GI created successfully', 201);
    } catch (err) {
      next(err);
    }
  };

  update = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const report = await laporanHarGiService.update(req.params.id, req.body as UpdateLaporanHarGiInput, actorOf(req), scope);
      successResponse(res, report, 'Laporan HAR GI updated successfully');
    } catch (err) {
      next(err);
    }
  };

  submit = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const report = await laporanHarGiService.submit(req.params.id, actorOf(req), scope);
      successResponse(res, report, 'Laporan HAR GI dikirim untuk validasi');
    } catch (err) {
      next(err);
    }
  };

  decide = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const report = await laporanHarGiService.decide(req.params.id, req.body as DecideLaporanHarGiInput, actorOf(req), scope);
      successResponse(res, report, 'Status validasi Laporan HAR GI diperbarui');
    } catch (err) {
      next(err);
    }
  };
}

export const laporanHarGiController = new LaporanHarGiController();
