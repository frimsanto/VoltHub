import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import { WRITE_ROLES } from '../../auth/roles';
import { validate } from '../../middlewares/validate';
import { assetController } from './asset.controller';
import {
  createAssetSchema,
  updateAssetSchema,
  listAssetQuerySchema,
  idParamSchema,
} from './asset.validation';
import { assetSimCardNestedRouter } from '../asset-sim-cards/asset-sim-card.routes';

/**
 * Asset routes.
 * RBAC (TDD_API §2): read = all authenticated;
 * write = SUPERADMIN, ADMIN, ADMIN_RTUPP.
 */
const router = Router();

router.use(authenticate);

// Nested SIM-card sub-resource: /assets/:assetId/sim-cards
router.use('/:assetId/sim-cards', assetSimCardNestedRouter);

router.get('/', validate(listAssetQuerySchema, 'query'), assetController.list);
// Live monitoring: RTU UP/DOWN snapshot. Declared before '/:id' so the literal
// path is not captured by the id param route.
router.get('/scada/summary', assetController.scadaSummary);
router.get('/:id', validate(idParamSchema, 'params'), assetController.getById);

router.post(
  '/',
  authorize(...WRITE_ROLES),
  validate(createAssetSchema),
  assetController.create
);
router.put(
  '/:id',
  authorize(...WRITE_ROLES),
  validate(idParamSchema, 'params'),
  validate(updateAssetSchema),
  assetController.update
);
router.delete(
  '/:id',
  authorize(...WRITE_ROLES),
  validate(idParamSchema, 'params'),
  assetController.remove
);

export default router;
