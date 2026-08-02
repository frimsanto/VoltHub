import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { scadaRealtimeController } from './scada-realtime.controller';
import { summaryQuerySchema, garduQuerySchema } from './scada-realtime.validation';

/**
 * SCADA real-time (INS/OOP) routes.
 *
 * RBAC: read-only monitoring derived from the imported availability reports —
 * granted to every authenticated role (same policy as the GIS/monitoring read
 * surface). No write endpoints; data is refreshed by the Excel importer.
 */
const router = Router();

router.use(authenticate);

router.get('/summary', validate(summaryQuerySchema, 'query'), scadaRealtimeController.summary);
router.get('/types', scadaRealtimeController.types);
router.get('/gardu', validate(garduQuerySchema, 'query'), scadaRealtimeController.gardu);

export default router;
