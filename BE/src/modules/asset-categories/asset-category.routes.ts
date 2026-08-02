import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import { validate } from '../../middlewares/validate';
import { WRITE_ROLES } from '../../auth/roles';
import { assetCategoryController } from './asset-category.controller';
import {
  createAssetCategorySchema,
  updateAssetCategorySchema,
  listAssetCategoryQuerySchema,
  idParamSchema,
} from './asset-category.validation';

/**
 * Asset Category routes (EPIC-3 Story 9).
 * RBAC: read = all authenticated; write = SUPER_ADMIN, ADMIN.
 */
const router = Router();
router.use(authenticate);

router.get('/', validate(listAssetCategoryQuerySchema, 'query'), assetCategoryController.list);
router.get('/:id', validate(idParamSchema, 'params'), assetCategoryController.getById);

router.post(
  '/',
  authorize(...WRITE_ROLES),
  validate(createAssetCategorySchema),
  assetCategoryController.create
);
router.put(
  '/:id',
  authorize(...WRITE_ROLES),
  validate(idParamSchema, 'params'),
  validate(updateAssetCategorySchema),
  assetCategoryController.update
);
router.delete(
  '/:id',
  authorize(...WRITE_ROLES),
  validate(idParamSchema, 'params'),
  assetCategoryController.remove
);

export default router;
