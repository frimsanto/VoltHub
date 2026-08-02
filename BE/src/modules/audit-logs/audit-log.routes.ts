import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import { validate } from '../../middlewares/validate';
import { MONITOR_ROLES } from '../../auth/roles';
import { auditLogController } from './audit-log.controller';
import { listAuditLogQuerySchema, idParamSchema } from './audit-log.validation';

/**
 * Audit Log routes (EPIC-6 Story 20).
 * READ-ONLY by design (BR-018: audit log must not be edited by any role).
 * RBAC: monitoring read tier (MASTER, MANAGER, ADMIN) — MASTER reads for audit
 * even though it holds no operational write. There is deliberately no
 * POST/PUT/DELETE.
 */
const router = Router();
router.use(authenticate);
router.use(authorize(...MONITOR_ROLES));

router.get('/', validate(listAuditLogQuerySchema, 'query'), auditLogController.list);
router.get('/:id', validate(idParamSchema, 'params'), auditLogController.getById);

export default router;
