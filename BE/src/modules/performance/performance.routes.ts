import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { performanceController } from './performance.controller';
import {
  listPerformanceQuerySchema,
  summaryQuerySchema,
  idParamSchema,
} from './performance.validation';

/**
 * Performance routes (EPIC-4 Story 15).
 * READ-ONLY API — performance data is import-only (BR-010/011). There is no
 * create/update/delete endpoint by design; writes flow through the import
 * engine (POST /imports/performance). Read = all authenticated roles.
 */
const router = Router();
router.use(authenticate);

router.get('/', validate(listPerformanceQuerySchema, 'query'), performanceController.list);
router.get('/summary', validate(summaryQuerySchema, 'query'), performanceController.summary);
router.get('/:id', validate(idParamSchema, 'params'), performanceController.getById);

export default router;
