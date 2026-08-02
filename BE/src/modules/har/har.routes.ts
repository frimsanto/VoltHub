import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import { validate } from '../../middlewares/validate';
import { harController } from './har.controller';
import {
  createHarReportSchema,
  createHarDetailSchema,
  updateHarDetailSchema,
  listHarQuerySchema,
  idParamSchema,
  detailParamsSchema,
} from './har.validation';

import { WRITE_ROLES as CRUD_ROLES } from '../../auth/roles';

/**
 * HAR routes.
 * RBAC (TDD_API §2): USER = Create/View; ADMIN/ADMIN_RTUPP/SUPERADMIN = CRUD.
 * → list/get/create-report/add-detail = any authenticated role;
 *   update/delete detail = CRUD roles only.
 */
const router = Router();
router.use(authenticate);

router.get('/', validate(listHarQuerySchema, 'query'), harController.list);
router.get('/:id', validate(idParamSchema, 'params'), harController.getById);
router.post('/', validate(createHarReportSchema), harController.create);

router.post(
  '/:id/details',
  validate(idParamSchema, 'params'),
  validate(createHarDetailSchema),
  harController.addDetail
);
router.put(
  '/:id/details/:detailId',
  authorize(...CRUD_ROLES),
  validate(detailParamsSchema, 'params'),
  validate(updateHarDetailSchema),
  harController.updateDetail
);
router.delete(
  '/:id/details/:detailId',
  authorize(...CRUD_ROLES),
  validate(detailParamsSchema, 'params'),
  harController.removeDetail
);

export default router;
