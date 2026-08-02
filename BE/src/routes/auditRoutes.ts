import { Router } from 'express';
import { authenticate, requireRole } from '../middlewares/auth';
import { getAuditLogs } from '../controllers/auditController';

const router = Router();

router.use(authenticate);

// GET /api/audit — Audit trail viewer.
// PETUGAS is excluded here; the controller further scopes ADMIN to their RTUPP.
router.get('/', requireRole(['SUPERADMIN', 'ADMIN_RTUPP', 'ADMIN']), getAuditLogs);

export default router;
