import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { successResponse } from '../../utils/response';
import { giDashboardService } from './gi-dashboard.service';

export class GiDashboardController {
  overview = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await giDashboardService.getOverview(req.user!.userId, req.user?.role);
      successResponse(res, data, 'GI dashboard overview retrieved successfully');
    } catch (err) {
      next(err);
    }
  };

  leaderboard = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
      const data = await giDashboardService.getLeaderboard(req.user!.userId, req.user?.role, limit);
      successResponse(res, data, 'GI leaderboard retrieved successfully');
    } catch (err) {
      next(err);
    }
  };
}

export const giDashboardController = new GiDashboardController();
