import { Router } from 'express';
import { authenticate, requireRole } from '../middlewares/auth';
import * as controller from '../controllers/rtuppController';

const router = Router();

router.use(authenticate);

// List RTUPP — ADMIN tier + read-only MANAGER.
router.get('/', requireRole(['MASTER', 'MANAGER', 'ADMIN', 'ADMIN_RTUPP', 'SUPERADMIN']), controller.getAllRtupp);

// Mutations (MASTER only — org structure)
router.post('/', requireRole(['MASTER', 'SUPERADMIN']), controller.createRtupp);
router.put('/:id', requireRole(['MASTER', 'SUPERADMIN']), controller.updateRtupp);
router.delete('/:id', requireRole(['MASTER', 'SUPERADMIN']), controller.deleteRtupp);

export default router;
