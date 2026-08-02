import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { successResponse, errorResponse } from '../../utils/response';
import { importService } from './import.service';
import type { ListJobsQuery } from './import.validation';

export class ImportController {
  // POST /imports/assets — multipart/form-data (field: file)
  importAssets = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) {
        errorResponse(res, 'Excel file is required (field "file")', 422);
        return;
      }
      const job = await importService.importAssets(
        req.file.originalname,
        req.file.buffer,
        req.user?.userId
      );
      const message =
        job.status === 'FAILED'
          ? 'Import finished with failures'
          : `Import finished: ${job.successRows}/${job.totalRows} rows imported`;
      successResponse(res, job, message, 201);
    } catch (err) {
      next(err);
    }
  };

  // POST /imports/sites — Import Gardu/Site (multipart field: file)
  importGardu = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) {
        errorResponse(res, 'Excel file is required (field "file")', 422);
        return;
      }
      const job = await importService.importGardu(req.file.originalname, req.file.buffer, req.user?.userId);
      const message =
        job.status === 'FAILED'
          ? 'Import finished with failures'
          : `Import finished: ${job.successRows}/${job.totalRows} rows imported`;
      successResponse(res, job, message, 201);
    } catch (err) {
      next(err);
    }
  };

  // POST /imports/performance — Import Performance (multipart field: file)
  importPerformance = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) {
        errorResponse(res, 'Excel file is required (field "file")', 422);
        return;
      }
      const job = await importService.importPerformance(
        req.file.originalname,
        req.file.buffer,
        req.user?.userId
      );
      const message =
        job.status === 'FAILED'
          ? 'Import finished with failures'
          : `Import finished: ${job.successRows}/${job.totalRows} rows imported`;
      successResponse(res, job, message, 201);
    } catch (err) {
      next(err);
    }
  };

  // POST /imports/scada/rtu-state — IFS RTU export (multipart field: file).
  // Updates live state on existing RTU assets; creates nothing.
  importScadaRtuState = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) {
        errorResponse(res, 'Excel file is required (field "file")', 422);
        return;
      }
      const job = await importService.importScadaRtuState(
        req.file.originalname,
        req.file.buffer,
        req.user?.userId
      );
      const message =
        job.status === 'FAILED'
          ? 'Import finished with failures'
          : `RTU state updated: ${job.successRows}/${job.totalRows} matched`;
      successResponse(res, job, message, 201);
    } catch (err) {
      next(err);
    }
  };

  listJobs = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { data, meta } = await importService.listJobs(req.query as unknown as ListJobsQuery);
      successResponse(res, data, 'Import jobs retrieved successfully', 200, meta);
    } catch (err) {
      next(err);
    }
  };

  getJob = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const job = await importService.getJob(req.params.id);
      successResponse(res, job, 'Import job retrieved successfully');
    } catch (err) {
      next(err);
    }
  };

  getJobErrors = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const errors = await importService.getJobErrors(req.params.id);
      successResponse(res, errors, 'Import errors retrieved successfully');
    } catch (err) {
      next(err);
    }
  };
}

export const importController = new ImportController();
