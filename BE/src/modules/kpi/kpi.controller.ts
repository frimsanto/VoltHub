import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { successResponse } from '../../utils/response';
import { kpiService } from './kpi.service';
import type { KpiQuery } from './kpi.validation';

/**
 * KPI Controller — thin HTTP glue. Pulls the authenticated user + validated
 * query, delegates to the service, and lets AppErrors bubble to the global
 * error handler via `next(err)`.
 */
export class KpiController {
  /** GET /api/v1/kpi/dashboard — all widgets in one optimized round trip. */
  dashboard = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await kpiService.getDashboard(
        req.user!.userId,
        req.user?.role,
        req.query as unknown as KpiQuery
      );
      successResponse(res, data, 'KPI dashboard retrieved successfully');
    } catch (err) {
      next(err);
    }
  };

  /** GET /api/v1/kpi/summary — the five scalar headline widgets. */
  summary = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await kpiService.getSummary(
        req.user!.userId,
        req.user?.role,
        req.query as unknown as KpiQuery
      );
      successResponse(res, data, 'KPI summary retrieved successfully');
    } catch (err) {
      next(err);
    }
  };

  /** GET /api/v1/kpi/team-performance — per-team totals. */
  teamPerformance = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await kpiService.getTeamPerformance(req.user!.userId, req.user?.role);
      successResponse(res, data, 'KPI team performance retrieved successfully');
    } catch (err) {
      next(err);
    }
  };

  /** GET /api/v1/kpi/monthly-trend — monthly job trend (zero-filled). */
  monthlyTrend = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await kpiService.getMonthlyTrend(
        req.user!.userId,
        req.user?.role,
        req.query as unknown as KpiQuery
      );
      successResponse(res, data, 'KPI monthly trend retrieved successfully');
    } catch (err) {
      next(err);
    }
  };
}

export const kpiController = new KpiController();
