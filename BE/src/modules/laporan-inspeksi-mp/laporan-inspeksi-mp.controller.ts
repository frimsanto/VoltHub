import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { successResponse } from '../../utils/response';
import { resolveRequestScope } from '../../utils/tenantScope';
import { laporanInspeksiMpService, type Actor } from './laporan-inspeksi-mp.service';
import type {
  CreateLaporanInspeksiMpInput,
  UpdateLaporanInspeksiMpInput,
  DecideLaporanInspeksiMpInput,
  ListLaporanInspeksiMpQuery,
  SearchGarduQuery,
} from './laporan-inspeksi-mp.validation';

const actorOf = (req: AuthRequest): Actor => ({ userId: req.user?.userId, role: req.user?.role });

export class LaporanInspeksiMpController {
  list = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const { data, meta } = await laporanInspeksiMpService.list(
        req.query as unknown as ListLaporanInspeksiMpQuery,
        actorOf(req),
        scope,
      );
      successResponse(res, data, 'Laporan Inspeksi MP retrieved successfully', 200, meta);
    } catch (err) {
      next(err);
    }
  };

  getById = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const report = await laporanInspeksiMpService.getById(req.params.id, actorOf(req), scope);
      successResponse(res, report, 'Laporan Inspeksi MP retrieved successfully');
    } catch (err) {
      next(err);
    }
  };

  create = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const report = await laporanInspeksiMpService.create(req.body as CreateLaporanInspeksiMpInput, actorOf(req), scope);
      successResponse(res, report, 'Laporan Inspeksi MP created successfully', 201);
    } catch (err) {
      next(err);
    }
  };

  update = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const report = await laporanInspeksiMpService.update(req.params.id, req.body as UpdateLaporanInspeksiMpInput, actorOf(req), scope);
      successResponse(res, report, 'Laporan Inspeksi MP updated successfully');
    } catch (err) {
      next(err);
    }
  };

  submit = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const report = await laporanInspeksiMpService.submit(req.params.id, actorOf(req), scope);
      successResponse(res, report, 'Laporan Inspeksi MP dikirim untuk validasi');
    } catch (err) {
      next(err);
    }
  };

  decide = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const report = await laporanInspeksiMpService.decide(req.params.id, req.body as DecideLaporanInspeksiMpInput, actorOf(req), scope);
      successResponse(res, report, 'Status validasi Laporan Inspeksi MP diperbarui');
    } catch (err) {
      next(err);
    }
  };

  // Dropdown Gardu Distribusi (dipakai Admin & petugas; sama utk Inspeksi/HAR).
  searchGardu = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const { q, limit } = req.query as unknown as SearchGarduQuery;
      const gardus = await laporanInspeksiMpService.searchGardu(q, scope, limit);
      successResponse(res, gardus, 'Gardu Distribusi retrieved successfully');
    } catch (err) {
      next(err);
    }
  };
}

export const laporanInspeksiMpController = new LaporanInspeksiMpController();
