import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { successResponse } from '../../utils/response';
import { resolveRequestScope } from '../../utils/tenantScope';
import { laporanGiService, type Actor } from './laporan-gi.service';
import type {
  CreateLaporanGiInput,
  UpdateLaporanGiInput,
  DecideLaporanGiInput,
  ListLaporanGiQuery,
} from './laporan-gi.validation';

const actorOf = (req: AuthRequest): Actor => ({ userId: req.user?.userId, role: req.user?.role });

export class LaporanGiController {
  list = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const { data, meta } = await laporanGiService.list(
        req.query as unknown as ListLaporanGiQuery,
        actorOf(req),
        scope,
      );
      successResponse(res, data, 'Laporan GI retrieved successfully', 200, meta);
    } catch (err) {
      next(err);
    }
  };

  getById = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const report = await laporanGiService.getById(req.params.id, actorOf(req), scope);
      successResponse(res, report, 'Laporan GI retrieved successfully');
    } catch (err) {
      next(err);
    }
  };

  create = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const report = await laporanGiService.create(req.body as CreateLaporanGiInput, actorOf(req), scope);
      successResponse(res, report, 'Laporan GI created successfully', 201);
    } catch (err) {
      next(err);
    }
  };

  update = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const report = await laporanGiService.update(req.params.id, req.body as UpdateLaporanGiInput, actorOf(req), scope);
      successResponse(res, report, 'Laporan GI updated successfully');
    } catch (err) {
      next(err);
    }
  };

  submit = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const report = await laporanGiService.submit(req.params.id, actorOf(req), scope);
      successResponse(res, report, 'Laporan GI dikirim untuk validasi');
    } catch (err) {
      next(err);
    }
  };

  decide = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const report = await laporanGiService.decide(req.params.id, req.body as DecideLaporanGiInput, actorOf(req), scope);
      successResponse(res, report, 'Status validasi Laporan GI diperbarui');
    } catch (err) {
      next(err);
    }
  };
}

export const laporanGiController = new LaporanGiController();
