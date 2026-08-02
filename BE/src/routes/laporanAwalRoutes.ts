import { Router } from 'express';
import * as controller from '../controllers/laporanAwalController';
import { authenticate } from '../middlewares/auth';
import { requireAdmin, requireReportWrite } from '../middlewares/rbac';
import { idempotency } from '../middlewares/idempotency';

const router = Router();

// All routes require authentication
router.use(authenticate);

// CRUD endpoints (write blocked for read-only ADMIN). The create path is
// idempotency-guarded so an offline replay after an ambiguous failure cannot
// duplicate a report (see middlewares/idempotency.ts).
router.post('/', requireReportWrite, idempotency, controller.create);
router.get('/', controller.getAll);
router.get('/:id', controller.getById);
router.put('/:id', requireReportWrite, controller.update);
router.delete('/:id', requireReportWrite, controller.remove);

// Validation endpoints (Admin only)
router.post('/:id/validate', requireAdmin, controller.validate);

export default router;
