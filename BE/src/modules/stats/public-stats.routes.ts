import { Router } from 'express';
import { publicStatsController } from './public-stats.controller';

/**
 * PUBLIC stats routes — NO authentication.
 *
 * Mounted at /api/v1/stats. Follows the same "intentionally public" precedent
 * as /api/health, /api/version, and /api/v1/verify: the login page must render
 * these aggregates before anyone has a session. Exposes ONLY whitelisted,
 * cached COUNT/percentage values — see public-stats.repository.ts.
 */
const router = Router();

router.get('/public', publicStatsController.publicStats);

export default router;
