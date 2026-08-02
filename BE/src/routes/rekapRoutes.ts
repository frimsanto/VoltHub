import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { requireMonitor } from '../middlewares/rbac';
import * as controller from '../controllers/rekapController';

const router = Router();

router.use(authenticate);
// Read-only monitoring/export — MASTER, MANAGER (read-only), ADMIN.
router.use(requireMonitor);

// GET /api/rekap?jenis=ALL&status=PENDING&search=...&page=1&limit=15&startDate=...&endDate=...&rtuppId=...
router.get('/', controller.getRekap);

// GET /api/rekap/export?jenis=ALL&status=...&startDate=...&endDate=...&rtuppId=...
router.get('/export', controller.exportRekapXlsx);

export default router;
