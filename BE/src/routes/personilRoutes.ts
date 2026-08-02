import { Router } from 'express';
import { authenticate, requireRole } from '../middlewares/auth';
import * as controller from '../controllers/personilController';

const router = Router();

router.use(authenticate);

// Read access for all authenticated roles.
// ADMIN is scoped to their own RTUPP inside the controller.
// PETUGAS is read-only (no mutation routes apply to them).
router.get('/', requireRole(['SUPERADMIN', 'ADMIN_RTUPP', 'ADMIN', 'PETUGAS']), controller.getAllPersonil);
router.get('/:id', requireRole(['SUPERADMIN', 'ADMIN_RTUPP', 'ADMIN', 'PETUGAS']), controller.getPersonilById);

// Mutations: ADMIN only (incl. legacy ADMIN_RTUPP fold). MASTER is a pure
// system administrator and holds no operational write.
router.post('/', requireRole(['ADMIN', 'ADMIN_RTUPP']), controller.createPersonil);
router.put('/:id', requireRole(['ADMIN', 'ADMIN_RTUPP']), controller.updatePersonil);
router.delete('/:id', requireRole(['ADMIN', 'ADMIN_RTUPP']), controller.deletePersonil);

export default router;
