import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import { validate } from '../../middlewares/validate';
import { WRITE_ROLES } from '../../auth/roles';
import { assetTypeController } from './asset-type.controller';
import {
  createAssetTypeSchema,
  updateAssetTypeSchema,
  listAssetTypeQuerySchema,
  idParamSchema,
} from './asset-type.validation';

/**
 * Asset Type routes (EPIC-3 Story 10).
 * RBAC: read = all authenticated; write = SUPER_ADMIN, ADMIN.
 */
const router = Router();
router.use(authenticate);

router.get('/', validate(listAssetTypeQuerySchema, 'query'), assetTypeController.list);
router.get('/:id', validate(idParamSchema, 'params'), assetTypeController.getById);

router.post('/', authorize(...WRITE_ROLES), validate(createAssetTypeSchema), assetTypeController.create);
router.put(
  '/:id',
  authorize(...WRITE_ROLES),
  validate(idParamSchema, 'params'),
  validate(updateAssetTypeSchema),
  assetTypeController.update
);
router.delete(
  '/:id',
  authorize(...WRITE_ROLES),
  validate(idParamSchema, 'params'),
  assetTypeController.remove
);

export default router;
