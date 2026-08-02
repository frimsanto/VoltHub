import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { successResponse } from '../../utils/response';
import { scadaRealtimeService } from './scada-realtime.service';
import type { GarduQuery, SummaryQuery } from './scada-realtime.validation';

/**
 * SCADA real-time controller — thin HTTP glue for the INS/OOP dashboard.
 * Read-only; figures are derived from the imported availability reports.
 */
export class ScadaRealtimeController {
  /** GET /api/v1/scada-realtime/summary?type=RC — headline INS/OOP + breakdown. */
  summary = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await scadaRealtimeService.getSummary(req.query as unknown as SummaryQuery);
      successResponse(res, data, 'SCADA realtime summary retrieved successfully');
    } catch (err) {
      next(err);
    }
  };

  /** GET /api/v1/scada-realtime/types — per-type totals for the overview cards. */
  types = async (_req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      successResponse(res, await scadaRealtimeService.getTypes(), 'SCADA type totals retrieved successfully');
    } catch (err) {
      next(err);
    }
  };

  /** GET /api/v1/scada-realtime/gardu — paginated gardu drill-down. */
  gardu = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { items, meta } = await scadaRealtimeService.listGardu(req.query as unknown as GarduQuery);
      successResponse(res, items, 'SCADA gardu list retrieved successfully', 200, meta);
    } catch (err) {
      next(err);
    }
  };
}

export const scadaRealtimeController = new ScadaRealtimeController();
