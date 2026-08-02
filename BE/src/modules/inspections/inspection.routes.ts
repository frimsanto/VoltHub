import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { uploadImage } from '../../middlewares/upload';
import { idempotency } from '../../middlewares/idempotency';
import { inspectionController } from './inspection.controller';
import {
  createInspectionSchema,
  createFindingSchema,
  listInspectionQuerySchema,
  idParamSchema,
} from './inspection.validation';

/**
 * Inspection routes.
 * RBAC (TDD_API §2): Inspections — all authenticated roles may Create/View
 * (USER = Create/View; ADMIN/ADMIN_RTUPP/SUPERADMIN = CRUD). So `authenticate`
 * alone gates these write endpoints.
 */
const router = Router();
router.use(authenticate);

router.get('/', validate(listInspectionQuerySchema, 'query'), inspectionController.list);
router.get('/:id', validate(idParamSchema, 'params'), inspectionController.getById);
// Idempotency-guarded: the offline engine creates the inspection first, then
// replays findings/photos. Guarding the parent create stops a duplicate
// inspection when the create response is lost after the server committed it.
router.post('/', idempotency, validate(createInspectionSchema), inspectionController.create);
router.post(
  '/:id/findings',
  validate(idParamSchema, 'params'),
  validate(createFindingSchema),
  inspectionController.addFinding
);

export default router;

/**
 * Findings routes (flat) — TDD_API §10: POST /findings/:id/photos
 * multipart/form-data with fields `photo` (file) and `caption`.
 */
export const findingsRouter = Router();
findingsRouter.use(authenticate);

findingsRouter.post(
  '/:id/photos',
  validate(idParamSchema, 'params'),
  uploadImage.single('photo'),
  inspectionController.addPhoto
);
