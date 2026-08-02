import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { successResponse } from '../../utils/response';
import { resolveRequestScope } from '../../utils/tenantScope';
import { laporanHarMpService, type Actor } from './laporan-har-mp.service';
import type {
  CreateLaporanHarMpInput,
  UpdateLaporanHarMpInput,
  DecideLaporanHarMpInput,
  ListLaporanHarMpQuery,
} from './laporan-har-mp.validation';

const actorOf = (req: AuthRequest): Actor => ({ userId: req.user?.userId, role: req.user?.role });

export class LaporanHarMpController {
  list = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const { data, meta } = await laporanHarMpService.list(
        req.query as unknown as ListLaporanHarMpQuery,
        actorOf(req),
        scope,
      );
      successResponse(res, data, 'Laporan HAR MP retrieved successfully', 200, meta);
    } catch (err) {
      next(err);
    }
  };

  getById = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const report = await laporanHarMpService.getById(req.params.id, actorOf(req), scope);
      successResponse(res, report, 'Laporan HAR MP retrieved successfully');
    } catch (err) {
      next(err);
    }
  };

  create = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const report = await laporanHarMpService.create(req.body as CreateLaporanHarMpInput, actorOf(req), scope);
      successResponse(res, report, 'Laporan HAR MP created successfully', 201);
    } catch (err) {
      next(err);
    }
  };

  update = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const report = await laporanHarMpService.update(req.params.id, req.body as UpdateLaporanHarMpInput, actorOf(req), scope);
      successResponse(res, report, 'Laporan HAR MP updated successfully');
    } catch (err) {
      next(err);
    }
  };

  submit = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const report = await laporanHarMpService.submit(req.params.id, actorOf(req), scope);
      successResponse(res, report, 'Laporan HAR MP dikirim untuk validasi');
    } catch (err) {
      next(err);
    }
  };

  decide = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const report = await laporanHarMpService.decide(req.params.id, req.body as DecideLaporanHarMpInput, actorOf(req), scope);
      successResponse(res, report, 'Status validasi Laporan HAR MP diperbarui');
    } catch (err) {
      next(err);
    }
  };
}

export const laporanHarMpController = new LaporanHarMpController();
