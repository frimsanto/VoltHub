import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { successResponse } from '../../utils/response';
import { resolveRequestScope } from '../../utils/tenantScope';
import { laporanInspeksiGhService, type Actor } from './laporan-inspeksi-gh.service';
import type {
  CreateLaporanInspeksiGhInput,
  UpdateLaporanInspeksiGhInput,
  DecideLaporanInspeksiGhInput,
  ListLaporanInspeksiGhQuery,
  FeedersByGhQuery,
} from './laporan-inspeksi-gh.validation';

const actorOf = (req: AuthRequest): Actor => ({ userId: req.user?.userId, role: req.user?.role });

export class LaporanInspeksiGhController {
  list = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const { data, meta } = await laporanInspeksiGhService.list(
        req.query as unknown as ListLaporanInspeksiGhQuery,
        actorOf(req),
        scope,
      );
      successResponse(res, data, 'Laporan Inspeksi GH retrieved successfully', 200, meta);
    } catch (err) {
      next(err);
    }
  };

  getById = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const report = await laporanInspeksiGhService.getById(req.params.id, actorOf(req), scope);
      successResponse(res, report, 'Laporan Inspeksi GH retrieved successfully');
    } catch (err) {
      next(err);
    }
  };

  create = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const report = await laporanInspeksiGhService.create(req.body as CreateLaporanInspeksiGhInput, actorOf(req), scope);
      successResponse(res, report, 'Laporan Inspeksi GH created successfully', 201);
    } catch (err) {
      next(err);
    }
  };

  update = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const report = await laporanInspeksiGhService.update(req.params.id, req.body as UpdateLaporanInspeksiGhInput, actorOf(req), scope);
      successResponse(res, report, 'Laporan Inspeksi GH updated successfully');
    } catch (err) {
      next(err);
    }
  };

  submit = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const report = await laporanInspeksiGhService.submit(req.params.id, actorOf(req), scope);
      successResponse(res, report, 'Laporan Inspeksi GH dikirim untuk validasi');
    } catch (err) {
      next(err);
    }
  };

  decide = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const report = await laporanInspeksiGhService.decide(req.params.id, req.body as DecideLaporanInspeksiGhInput, actorOf(req), scope);
      successResponse(res, report, 'Status validasi Laporan Inspeksi GH diperbarui');
    } catch (err) {
      next(err);
    }
  };

  // Dropdown penyulang milik satu GH (dipakai Admin & petugas; sama utk Inspeksi/HAR).
  feedersByGh = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const { locationId } = req.query as unknown as FeedersByGhQuery;
      const feeders = await laporanInspeksiGhService.listFeedersByGh(locationId, scope);
      successResponse(res, feeders, 'Penyulang GH retrieved successfully');
    } catch (err) {
      next(err);
    }
  };
}

export const laporanInspeksiGhController = new LaporanInspeksiGhController();
