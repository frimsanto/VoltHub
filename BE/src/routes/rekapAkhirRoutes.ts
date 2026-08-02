import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { requireMonitor } from '../middlewares/rbac';
import * as controller from '../controllers/rekapAkhirController';

const router = Router();

router.use(authenticate);
// Read-only monitoring/export — MASTER, MANAGER (read-only), ADMIN.
router.use(requireMonitor);

// GET /api/rekap-akhir?status=&search=&startDate=&endDate=&rtuppId=&page=&limit=
router.get('/', controller.getRekap);

// GET /api/rekap-akhir/export?columns=reportId,gardu,...&status=&startDate=&endDate=&rtuppId=
router.get('/export', controller.exportRekap);

export default router;
