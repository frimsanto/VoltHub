import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import { validate } from '../../middlewares/validate';
import { locationController } from './location.controller';
import {
  createLocationSchema,
  updateLocationSchema,
  listLocationQuerySchema,
  idParamSchema,
  verifyCoordinatesSchema,
} from './location.validation';

/**
 * Location routes.
 * RBAC (TDD_API §2): read = all authenticated roles; write = ADMIN only
 * (MASTER is a pure system administrator — no operational writes).
 */
const router = Router();

router.use(authenticate);

// Read — every authenticated role
router.get('/', validate(listLocationQuerySchema, 'query'), locationController.list);
router.get('/:id', validate(idParamSchema, 'params'), locationController.getById);

// Field geo-verification — PETUGAS may correct/confirm a gardu's coordinates
// during a visit (ADMIN included; MASTER excluded — no operational writes).
// Narrowly scoped: only lat/lng + a verification note, never name/code/status.
// Every call is audited.
router.patch(
  '/:id/coordinates',
  authorize('ADMIN', 'PETUGAS'),
  validate(idParamSchema, 'params'),
  validate(verifyCoordinatesSchema),
  locationController.verifyCoordinates
);

// Write — ADMIN only
router.post('/', authorize('ADMIN'), validate(createLocationSchema), locationController.create);
router.put(
  '/:id',
  authorize('ADMIN'),
  validate(idParamSchema, 'params'),
  validate(updateLocationSchema),
  locationController.update
);
router.delete('/:id', authorize('ADMIN'), validate(idParamSchema, 'params'), locationController.remove);

export default router;
