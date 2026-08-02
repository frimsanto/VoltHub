import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { successResponse } from '../../utils/response';
import { auditLogService } from './audit-log.service';
import type { ListAuditLogQuery } from './audit-log.validation';

export class AuditLogController {
  list = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { data, meta } = await auditLogService.list(req.query as unknown as ListAuditLogQuery);
      successResponse(res, data, 'Audit logs retrieved successfully', 200, meta);
    } catch (err) {
      next(err);
    }
  };

  getById = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const log = await auditLogService.getById(req.params.id);
      successResponse(res, log, 'Audit log retrieved successfully');
    } catch (err) {
      next(err);
    }
  };
}

export const auditLogController = new AuditLogController();
