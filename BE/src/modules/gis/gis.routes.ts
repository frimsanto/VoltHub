import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { gisController } from './gis.controller';
import {
  featuresQuerySchema,
  heatmapQuerySchema,
  clustersQuerySchema,
  idParamSchema,
} from './gis.validation';

/**
 * GIS Monitoring routes.
 *
 * RBAC: read-only spatial visualization of existing operational data — granted
 * to every authenticated role (mirrors the Locations read policy). There is no
 * write surface; the map only reads `locations`/`assets`/`tickets`/`inspections`.
 */
const router = Router();

router.use(authenticate);

router.get('/layers', gisController.layers);
router.get('/features', validate(featuresQuerySchema, 'query'), gisController.features);
router.get('/teams', gisController.teams);
router.get('/heatmap', validate(heatmapQuerySchema, 'query'), gisController.heatmap);
router.get('/clusters', validate(clustersQuerySchema, 'query'), gisController.clusters);
router.get('/locations/:id', validate(idParamSchema, 'params'), gisController.detail);

export default router;
