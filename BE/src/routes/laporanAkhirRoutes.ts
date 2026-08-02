import { Router } from 'express';
import * as controller from '../controllers/laporanAkhirController';
import { authenticate } from '../middlewares/auth';
import { requireAdmin, requireReportWrite } from '../middlewares/rbac';
import { idempotency } from '../middlewares/idempotency';

const router = Router();

router.use(authenticate);

// Idempotency-guarded create — an offline replay after an ambiguous failure
// replays the stored response instead of creating a duplicate report.
router.post('/', requireReportWrite, idempotency, controller.create);
router.get('/', controller.getAll);
router.get('/:id', controller.getById);
router.put('/:id', requireReportWrite, controller.update);
router.delete('/:id', requireReportWrite, controller.remove);

router.post('/:id/validate', requireAdmin, controller.validate);

export default router;
