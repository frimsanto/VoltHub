import { Router } from 'express';
import * as controller from '../controllers/historyController';
import { authenticate } from '../middlewares/auth';

const router = Router();

router.use(authenticate);

router.get('/', controller.getHistory);
router.get('/stats', controller.getHistoryStats);

export default router;
