import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import { validate } from '../../middlewares/validate';
import { SUPER_ONLY } from '../../auth/roles';
import { organizationController } from './organization.controller';
import {
  createOrganizationSchema,
  updateOrganizationSchema,
  listOrganizationQuerySchema,
  idParamSchema,
} from './organization.validation';

/**
 * Organization routes (Gardu-centric foundation, EPIC-1 Story 1).
 * RBAC (Permission Matrix): read = all authenticated; write = SUPER_ADMIN only
 * (global master, above RTUPP scope).
 */
const router = Router();
router.use(authenticate);

router.get('/', validate(listOrganizationQuerySchema, 'query'), organizationController.list);
router.get('/:id', validate(idParamSchema, 'params'), organizationController.getById);

router.post('/', authorize(...SUPER_ONLY), validate(createOrganizationSchema), organizationController.create);
router.put(
  '/:id',
  authorize(...SUPER_ONLY),
  validate(idParamSchema, 'params'),
  validate(updateOrganizationSchema),
  organizationController.update
);
router.delete(
  '/:id',
  authorize(...SUPER_ONLY),
  validate(idParamSchema, 'params'),
  organizationController.remove
);

export default router;
