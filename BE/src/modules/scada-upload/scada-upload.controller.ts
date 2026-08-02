import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { successResponse, errorResponse } from '../../utils/response';
import { scadaUploadService } from './scada-upload.service';
import type { LatestQuery, LinesQuery, RtuQuery, UploadBody } from './scada-upload.validation';

/**
 * SCADA snapshot controller — thin HTTP glue for the Siemens SP7 export
 * upload (NOC) and the Inscan/OOP + Lines dashboards that read from it.
 */
export class ScadaUploadController {
  /** POST /api/v1/scada/upload — multipart {file, fileType} → replace snapshot. */
  upload = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file?.buffer) {
        errorResponse(res, 'File .xlsx wajib diupload pada field "file"', 400);
        return;
      }
      const userId = req.user?.userId;
      if (!userId) {
        errorResponse(res, 'User not authenticated', 401);
        return;
      }
      const { fileType, notes } = req.body as UploadBody;
      const summary = await scadaUploadService.uploadSnapshot({
        buffer: req.file.buffer,
        fileType,
        userId,
        notes,
      });
      successResponse(res, summary, `Snapshot ${fileType} berhasil di-replace`, 201);
    } catch (err) {
      next(err);
    }
  };

  /** GET /api/v1/scada/snapshot/latest?fileType=RTU — latest snapshot metadata. */
  latest = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { fileType } = req.query as unknown as LatestQuery;
      const data = await scadaUploadService.getLatest(fileType);
      successResponse(res, data, 'Latest SCADA snapshot retrieved successfully');
    } catch (err) {
      next(err);
    }
  };

  /** GET /api/v1/scada/rtu — paginated RTU rows from the latest snapshot. */
  listRtu = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { items, meta } = await scadaUploadService.listRtu(req.query as unknown as RtuQuery);
      successResponse(res, items, 'SCADA RTU rows retrieved successfully', 200, meta);
    } catch (err) {
      next(err);
    }
  };

  /** GET /api/v1/scada/lines — paginated Line rows from the latest snapshot. */
  listLines = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { items, meta } = await scadaUploadService.listLines(
        req.query as unknown as LinesQuery
      );
      successResponse(res, items, 'SCADA Line rows retrieved successfully', 200, meta);
    } catch (err) {
      next(err);
    }
  };

  /** GET /api/v1/scada/upload-history — last 30 uploads (metadata only). */
  history = async (_req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      successResponse(
        res,
        await scadaUploadService.history(),
        'SCADA upload history retrieved successfully'
      );
    } catch (err) {
      next(err);
    }
  };
}

export const scadaUploadController = new ScadaUploadController();
