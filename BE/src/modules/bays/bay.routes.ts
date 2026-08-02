import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import { validate } from '../../middlewares/validate';
import { WRITE_ROLES } from '../../auth/roles';
import { bayController } from './bay.controller';
import {
  createBaySchema,
  updateBaySchema,
  listBayQuerySchema,
  idParamSchema,
} from './bay.validation';

/**
 * Bay routes (GI → Bay master data).
 * RBAC:
 *   read   = all authenticated (scoped per RTUPP)
 *   manage = MASTER, ADMIN (WRITE_ROLES) — MANAGER is read-only, PETUGAS no master data
 */
const router = Router();
router.use(authenticate);

router.get('/', validate(listBayQuerySchema, 'query'), bayController.list);
router.get('/:id', validate(idParamSchema, 'params'), bayController.getById);

router.post('/', authorize(...WRITE_ROLES), validate(createBaySchema), bayController.create);
router.put(
  '/:id',
  authorize(...WRITE_ROLES),
  validate(idParamSchema, 'params'),
  validate(updateBaySchema),
  bayController.update
);
router.delete('/:id', authorize(...WRITE_ROLES), validate(idParamSchema, 'params'), bayController.remove);

export default router;
