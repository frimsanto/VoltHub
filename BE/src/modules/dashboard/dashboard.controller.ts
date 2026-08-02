import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { successResponse } from '../../utils/response';
import { dashboardService } from './dashboard.service';
import { leaderboardService } from './leaderboard.service';

export class DashboardController {
  /** Single aggregated management-overview payload (replaces ~30 count calls). */
  overview = async (_req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await dashboardService.getOverview();
      successResponse(res, data, 'Dashboard overview retrieved successfully');
    } catch (err) {
      next(err);
    }
  };

  /** Monthly team leaderboard within one RTUPP (PETUGAS pinned to their own). */
  leaderboard = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { rtuppId, month } = req.query;
      const data = await leaderboardService.getLeaderboard(req.user, {
        rtuppId: typeof rtuppId === 'string' && rtuppId ? rtuppId : undefined,
        month: typeof month === 'string' && month ? month : undefined,
      });
      successResponse(res, data, 'Leaderboard retrieved successfully');
    } catch (err) {
      next(err);
    }
  };
}

export const dashboardController = new DashboardController();
