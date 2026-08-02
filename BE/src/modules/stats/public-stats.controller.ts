import { Request, Response, NextFunction } from 'express';
import { successResponse } from '../../utils/response';
import { publicStatsService } from './public-stats.service';

export class PublicStatsController {
  /** Whitelisted, cached operational aggregates for the public login page. */
  publicStats = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await publicStatsService.getPublicStats();
      // Allow CDN/proxy caching too — content is public and non-sensitive.
      res.setHeader('Cache-Control', 'public, max-age=300');
      successResponse(res, data, 'Public stats retrieved successfully');
    } catch (err) {
      next(err);
    }
  };
}

export const publicStatsController = new PublicStatsController();
