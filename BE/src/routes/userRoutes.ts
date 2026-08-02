import { Router } from 'express';
import { authenticate, requireRole } from '../middlewares/auth';
import * as controller from '../controllers/userController';

const router = Router();

router.use(authenticate);

// Get RTUPP list (for dropdown) - must be before /:id
router.get('/dropdown/rtupp', controller.getRtuppList);

// Get Team list (for dropdown) - must be before /:id
router.get('/dropdown/team', controller.getTeamList);

// List users — ADMIN tier only (MASTER/ADMIN). MANAGER is read-only and has no
// business with user accounts, so it is excluded here too (the FE redirects it
// to /unauthorized). ADMIN sees PETUGAS+ADMIN; row-level scope in the controller.
router.get('/', requireRole(['MASTER', 'ADMIN', 'ADMIN_RTUPP', 'SUPERADMIN']), controller.getAllUsers);

// Get user by ID — ADMIN tier only (MASTER/ADMIN).
router.get('/:id', requireRole(['MASTER', 'ADMIN', 'ADMIN_RTUPP', 'SUPERADMIN']), controller.getUserById);

// User-management writes are open to MASTER and ADMIN only (MANAGER excluded —
// read-only). The route gates the *tier*; the controller enforces fine-grained
// rules — target role (ADMIN limited to PETUGAS, never ADMIN/MANAGER/MASTER) and
// RTUPP isolation (ADMIN scoped to its own RTUPP).
const USER_WRITE_ROLES = ['MASTER', 'ADMIN', 'ADMIN_RTUPP', 'SUPERADMIN'];

// Create user
router.post('/', requireRole(USER_WRITE_ROLES), controller.createUser);

// Update user
router.put('/:id', requireRole(USER_WRITE_ROLES), controller.updateUser);

// Reset another user's password
router.post('/:id/reset-password', requireRole(USER_WRITE_ROLES), controller.resetPassword);

// Delete user (ADMIN limited to PETUGAS; never an ADMIN/MANAGER/MASTER account)
router.delete('/:id', requireRole(USER_WRITE_ROLES), controller.deleteUser);

export default router;
