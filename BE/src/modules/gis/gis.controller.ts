import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { successResponse } from '../../utils/response';
import { resolveRequestScope } from '../../utils/tenantScope';
import { gisService } from './gis.service';
import type { FeaturesQuery, HeatmapQuery, ClustersQuery } from './gis.validation';

/**
 * GIS Controller — thin HTTP glue. Pulls the validated query, delegates to the
 * service, and lets AppErrors bubble to the global handler via `next(err)`.
 */
export class GisController {
  /** GET /api/v1/gis/layers — layer catalog + live counts + overall bbox. */
  layers = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      successResponse(res, await gisService.getLayers(scope), 'GIS layers retrieved successfully');
    } catch (err) {
      next(err);
    }
  };

  /** GET /api/v1/gis/features — site substrate as a GeoJSON FeatureCollection. */
  features = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const data = await gisService.getFeatures(req.query as unknown as FeaturesQuery, scope);
      successResponse(res, data, 'GIS features retrieved successfully');
    } catch (err) {
      next(err);
    }
  };

  /** GET /api/v1/gis/teams — derived team last-known positions. */
  teams = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      successResponse(res, await gisService.getTeams(scope), 'GIS team positions retrieved successfully');
    } catch (err) {
      next(err);
    }
  };

  /** GET /api/v1/gis/heatmap — weighted density points. */
  heatmap = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const data = await gisService.getHeatmap(req.query as unknown as HeatmapQuery, scope);
      successResponse(res, data, 'GIS heatmap retrieved successfully');
    } catch (err) {
      next(err);
    }
  };

  /** GET /api/v1/gis/clusters — server-side grid clusters for low-zoom views. */
  clusters = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const data = await gisService.getClusters(req.query as unknown as ClustersQuery, scope);
      successResponse(res, data, 'GIS clusters retrieved successfully');
    } catch (err) {
      next(err);
    }
  };

  /** GET /api/v1/gis/locations/:id — detail-popup payload for one site. */
  detail = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const data = await gisService.getSiteDetail(req.params.id, scope);
      successResponse(res, data, 'GIS site detail retrieved successfully');
    } catch (err) {
      next(err);
    }
  };
}

export const gisController = new GisController();
