import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import { validate } from '../../middlewares/validate';
import { WRITE_ROLES } from '../../auth/roles';
import { up3Controller } from './up3.controller';
import {
  createUp3Schema,
  updateUp3Schema,
  listUp3QuerySchema,
  idParamSchema,
} from './up3.validation';

/**
 * UP3 routes (EPIC-1 Story 3).
 * RBAC (Permission Matrix): read = all authenticated; write = SUPER_ADMIN, ADMIN.
 */
const router = Router();
router.use(authenticate);

router.get('/', validate(listUp3QuerySchema, 'query'), up3Controller.list);
router.get('/:id', validate(idParamSchema, 'params'), up3Controller.getById);

router.post('/', authorize(...WRITE_ROLES), validate(createUp3Schema), up3Controller.create);
router.put(
  '/:id',
  authorize(...WRITE_ROLES),
  validate(idParamSchema, 'params'),
  validate(updateUp3Schema),
  up3Controller.update
);
router.delete('/:id', authorize(...WRITE_ROLES), validate(idParamSchema, 'params'), up3Controller.remove);

export default router;
