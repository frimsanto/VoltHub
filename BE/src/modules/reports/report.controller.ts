import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { successResponse } from '../../utils/response';
import { reportService } from './report.service';
import type {
  GenerateInput,
  GenerateInspectionInput,
  GenerateHarInput,
  ListGeneratedQuery,
} from './report.validation';

export class ReportController {
  /** Unified generate: any source + format (Enterprise Report Generator). */
  generate = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { sourceType, sourceId, format } = req.body as GenerateInput;
      const report = await reportService.generate({ sourceType, sourceId, format }, req.user?.userId);
      successResponse(res, report, 'Report generated successfully', 201);
    } catch (err) {
      next(err);
    }
  };

  generateInspection = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { inspectionId } = req.body as GenerateInspectionInput;
      const report = await reportService.generateInspection(inspectionId, req.user?.userId);
      successResponse(res, report, 'Inspection report generated successfully', 201);
    } catch (err) {
      next(err);
    }
  };

  generateHar = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { harReportId } = req.body as GenerateHarInput;
      const report = await reportService.generateHar(harReportId, req.user?.userId);
      successResponse(res, report, 'HAR report generated successfully', 201);
    } catch (err) {
      next(err);
    }
  };

  listGenerated = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { data, meta } = await reportService.list(req.query as unknown as ListGeneratedQuery);
      successResponse(res, data, 'Generated reports retrieved successfully', 200, meta);
    } catch (err) {
      next(err);
    }
  };

  downloadHistory = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const downloads = await reportService.downloadHistory(req.params.id);
      successResponse(res, downloads, 'Download history retrieved successfully');
    } catch (err) {
      next(err);
    }
  };

  download = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { report, absPath, downloadName, contentType } = await reportService.getForDownload(
        req.params.id,
        req.user?.userId ?? null,
        req.ip ?? null,
      );
      void report;
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
      res.sendFile(absPath);
    } catch (err) {
      next(err);
    }
  };
}

export const reportController = new ReportController();
