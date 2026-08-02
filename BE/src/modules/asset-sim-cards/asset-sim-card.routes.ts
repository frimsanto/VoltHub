import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import { validate } from '../../middlewares/validate';
import { assetSimCardController } from './asset-sim-card.controller';
import {
  createSimCardSchema,
  updateSimCardSchema,
  idParamSchema,
  assetIdParamSchema,
} from './asset-sim-card.validation';

import { WRITE_ROLES } from '../../auth/roles';

/**
 * Nested under asset routes: /assets/:assetId/sim-cards
 * (mergeParams so :assetId is visible here). Parent already runs `authenticate`.
 */
export const assetSimCardNestedRouter = Router({ mergeParams: true });

assetSimCardNestedRouter.get(
  '/',
  validate(assetIdParamSchema, 'params'),
  assetSimCardController.listByAsset
);
assetSimCardNestedRouter.post(
  '/',
  authorize(...WRITE_ROLES),
  validate(assetIdParamSchema, 'params'),
  validate(createSimCardSchema),
  assetSimCardController.create
);

/**
 * Flat routes: /sim-cards/:id (PUT, DELETE) — TDD_API §8.
 */
const flatRouter = Router();
flatRouter.use(authenticate);

flatRouter.put(
  '/:id',
  authorize(...WRITE_ROLES),
  validate(idParamSchema, 'params'),
  validate(updateSimCardSchema),
  assetSimCardController.update
);
flatRouter.delete(
  '/:id',
  authorize(...WRITE_ROLES),
  validate(idParamSchema, 'params'),
  assetSimCardController.remove
);

export default flatRouter;
