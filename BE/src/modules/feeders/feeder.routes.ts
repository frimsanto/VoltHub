import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import { validate } from '../../middlewares/validate';
import { feederController } from './feeder.controller';
import {
  createFeederSchema,
  updateFeederSchema,
  listFeederQuerySchema,
  idParamSchema,
} from './feeder.validation';

/**
 * Feeder routes.
 * RBAC (TDD_API §2): read = all authenticated; write = ADMIN only
 * (MASTER is a pure system administrator — no operational writes).
 */
const router = Router();

router.use(authenticate);

router.get('/', validate(listFeederQuerySchema, 'query'), feederController.list);
router.get('/:id', validate(idParamSchema, 'params'), feederController.getById);

router.post('/', authorize('ADMIN'), validate(createFeederSchema), feederController.create);
router.put(
  '/:id',
  authorize('ADMIN'),
  validate(idParamSchema, 'params'),
  validate(updateFeederSchema),
  feederController.update
);
router.delete('/:id', authorize('ADMIN'), validate(idParamSchema, 'params'), feederController.remove);

export default router;
