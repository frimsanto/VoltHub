import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { giDashboardController } from './gi-dashboard.controller';

const router = Router();
router.use(authenticate);

router.get('/', giDashboardController.overview);
router.get('/leaderboard', giDashboardController.leaderboard);

export default router;
