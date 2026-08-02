import { Router } from 'express';
import { authenticate, requireRole } from '../middlewares/auth';
import * as controller from '../controllers/teamController';

const router = Router();

router.use(authenticate);

// List Teams — ADMIN tier + read-only MANAGER.
router.get('/', requireRole(['MASTER', 'MANAGER', 'ADMIN', 'ADMIN_RTUPP', 'SUPERADMIN']), controller.getAllTeams);

// Mutations (MASTER only — org structure)
router.post('/', requireRole(['MASTER', 'SUPERADMIN']), controller.createTeam);
router.put('/:id', requireRole(['MASTER', 'SUPERADMIN']), controller.updateTeam);
router.delete('/:id', requireRole(['MASTER', 'SUPERADMIN']), controller.deleteTeam);

export default router;
