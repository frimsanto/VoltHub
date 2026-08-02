import path from 'path';
import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { successResponse } from '../../utils/response';
import { resolveRequestScope } from '../../utils/tenantScope';
import { env } from '../../config/env';
import { workOrderService, type Actor } from './work-order.service';
import type {
  CreateWorkOrderInput,
  UpdateWorkOrderInput,
  AssignWorkOrderInput,
  RejectWorkOrderInput,
  CloseWorkOrderInput,
  ListWorkOrderQuery,
  WorkOrderResultInput,
} from './work-order.validation';

const UPLOAD_BASE = path.join(process.cwd(), env.UPLOAD_DIR);
/** Convert an absolute stored file path → servable /uploads/... web path. */
const toWebPath = (absPath: string): string =>
  `/uploads/${path.relative(UPLOAD_BASE, absPath).split(path.sep).join('/')}`;

const actorOf = (req: AuthRequest): Actor => ({ userId: req.user?.userId, role: req.user?.role });

export class WorkOrderController {
  list = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const { data, meta } = await workOrderService.list(
        req.query as unknown as ListWorkOrderQuery,
        actorOf(req),
        scope
      );
      successResponse(res, data, 'Work Orders retrieved successfully', 200, meta);
    } catch (err) {
      next(err);
    }
  };

  stats = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const data = await workOrderService.stats(scope);
      successResponse(res, data, 'Work Order stats retrieved successfully');
    } catch (err) {
      next(err);
    }
  };

  getById = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const wo = await workOrderService.getById(req.params.id, actorOf(req), scope);
      successResponse(res, wo, 'Work Order retrieved successfully');
    } catch (err) {
      next(err);
    }
  };

  create = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const wo = await workOrderService.create(req.body as CreateWorkOrderInput, actorOf(req), scope);
      successResponse(res, wo, 'Work Order created successfully', 201);
    } catch (err) {
      next(err);
    }
  };

  update = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const wo = await workOrderService.update(req.params.id, req.body as UpdateWorkOrderInput, actorOf(req), scope);
      successResponse(res, wo, 'Work Order updated successfully');
    } catch (err) {
      next(err);
    }
  };

  assign = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const wo = await workOrderService.assign(req.params.id, req.body as AssignWorkOrderInput, actorOf(req), scope);
      successResponse(res, wo, 'Work Order assigned successfully');
    } catch (err) {
      next(err);
    }
  };

  start = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const wo = await workOrderService.start(req.params.id, actorOf(req), scope);
      successResponse(res, wo, 'Work Order started');
    } catch (err) {
      next(err);
    }
  };

  submit = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const wo = await workOrderService.submit(
        req.params.id,
        (req.body ?? {}) as WorkOrderResultInput,
        actorOf(req),
        scope,
      );
      successResponse(res, wo, 'Work Order submitted for approval');
    } catch (err) {
      next(err);
    }
  };

  saveResult = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const wo = await workOrderService.saveResult(
        req.params.id,
        req.body as WorkOrderResultInput,
        actorOf(req),
        scope,
      );
      successResponse(res, wo, 'Laporan WO disimpan');
    } catch (err) {
      next(err);
    }
  };

  listPhotos = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const rows = await workOrderService.listPhotos(req.params.id, actorOf(req), scope);
      successResponse(res, rows, 'Foto WO retrieved successfully');
    } catch (err) {
      next(err);
    }
  };

  uploadPhotos = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      const rows = files.map((f) => ({
        originalName: f.originalname,
        fileName: f.filename,
        mimeType: f.mimetype,
        size: f.size,
        path: toWebPath(f.path),
      }));
      const category = typeof req.body?.category === 'string' ? req.body.category : 'FOTO_HASIL';
      const result = await workOrderService.addPhotos(req.params.id, rows, category, actorOf(req), scope);
      successResponse(res, result, 'Foto WO berhasil diunggah', 201);
    } catch (err) {
      next(err);
    }
  };

  removePhoto = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      await workOrderService.removePhoto(req.params.id, req.params.attachmentId, actorOf(req), scope);
      successResponse(res, null, 'Foto WO dihapus');
    } catch (err) {
      next(err);
    }
  };

  approve = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const wo = await workOrderService.approve(req.params.id, actorOf(req), scope);
      successResponse(res, wo, 'Work Order approved');
    } catch (err) {
      next(err);
    }
  };

  reject = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const wo = await workOrderService.reject(req.params.id, req.body as RejectWorkOrderInput, actorOf(req), scope);
      successResponse(res, wo, 'Work Order rejected');
    } catch (err) {
      next(err);
    }
  };

  close = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const wo = await workOrderService.close(req.params.id, req.body as CloseWorkOrderInput, actorOf(req), scope);
      successResponse(res, wo, 'Work Order closed');
    } catch (err) {
      next(err);
    }
  };

  reopen = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const wo = await workOrderService.reopen(req.params.id, actorOf(req), scope);
      successResponse(res, wo, 'Work Order reopened');
    } catch (err) {
      next(err);
    }
  };

  remove = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      await workOrderService.remove(req.params.id, actorOf(req), scope);
      successResponse(res, null, 'Work Order deleted successfully');
    } catch (err) {
      next(err);
    }
  };
}

export const workOrderController = new WorkOrderController();
