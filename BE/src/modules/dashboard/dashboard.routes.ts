import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { dashboardController } from './dashboard.controller';

/**
 * Dashboard routes (V2). One aggregate endpoint backs the entire management
 * overview so the SPA makes a single request instead of fanning out a count
 * query per card. Any authenticated role may read it.
 */
const router = Router();
router.use(authenticate);

router.get('/overview', dashboardController.overview);

// Monthly team leaderboard (?rtuppId=&month=YYYY-MM). Every role may read it;
// PETUGAS is pinned to their own RTUPP inside the service (fail-closed).
router.get('/leaderboard', dashboardController.leaderboard);

export default router;
