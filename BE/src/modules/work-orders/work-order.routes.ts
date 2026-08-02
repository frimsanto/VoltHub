import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import { validate } from '../../middlewares/validate';
import { uploadAllInOne, handleUploadError } from '../../middlewares/uploadMiddleware';
import { WRITE_ROLES, REPORT_WRITE_ROLES } from '../../auth/roles';
import { workOrderController } from './work-order.controller';
import {
  createWorkOrderSchema,
  updateWorkOrderSchema,
  assignWorkOrderSchema,
  rejectWorkOrderSchema,
  closeWorkOrderSchema,
  workOrderResultSchema,
  listWorkOrderQuerySchema,
  idParamSchema,
} from './work-order.validation';

/**
 * Work Order routes — Operation Management System GI RTUPP1.
 * RBAC:
 *   read              = all authenticated (PETUGAS auto-restricted to own WOs)
 *   create/update/assign/approve/reject/close/reopen/delete = MASTER, ADMIN
 *   start/submit      = MASTER, ADMIN, PETUGAS (field officer drives execution)
 */
const router = Router();
router.use(authenticate);

router.get('/', validate(listWorkOrderQuerySchema, 'query'), workOrderController.list);
// Operational dashboard aggregates (declared before /:id so it is not shadowed).
router.get('/stats/summary', workOrderController.stats);
router.get('/:id', validate(idParamSchema, 'params'), workOrderController.getById);

router.post('/', authorize(...WRITE_ROLES), validate(createWorkOrderSchema), workOrderController.create);
router.put(
  '/:id',
  authorize(...WRITE_ROLES),
  validate(idParamSchema, 'params'),
  validate(updateWorkOrderSchema),
  workOrderController.update
);
router.post(
  '/:id/assign',
  authorize(...WRITE_ROLES),
  validate(idParamSchema, 'params'),
  validate(assignWorkOrderSchema),
  workOrderController.assign
);

// Field-officer execution transitions + Laporan WO (hasil penyelesaian)
router.post('/:id/start', authorize(...REPORT_WRITE_ROLES), validate(idParamSchema, 'params'), workOrderController.start);
router.post(
  '/:id/result',
  authorize(...REPORT_WRITE_ROLES),
  validate(idParamSchema, 'params'),
  validate(workOrderResultSchema),
  workOrderController.saveResult,
);
router.post(
  '/:id/submit',
  authorize(...REPORT_WRITE_ROLES),
  validate(idParamSchema, 'params'),
  validate(workOrderResultSchema),
  workOrderController.submit,
);

// Laporan WO photos (foto sebelum/sesudah)
router.get('/:id/photos', validate(idParamSchema, 'params'), workOrderController.listPhotos);
router.post(
  '/:id/photos',
  authorize(...REPORT_WRITE_ROLES),
  validate(idParamSchema, 'params'),
  uploadAllInOne,
  handleUploadError,
  workOrderController.uploadPhotos,
);
router.delete(
  '/:id/photos/:attachmentId',
  authorize(...REPORT_WRITE_ROLES),
  validate(idParamSchema, 'params'),
  workOrderController.removePhoto,
);

// Admin approval transitions
router.post('/:id/approve', authorize(...WRITE_ROLES), validate(idParamSchema, 'params'), workOrderController.approve);
router.post(
  '/:id/reject',
  authorize(...WRITE_ROLES),
  validate(idParamSchema, 'params'),
  validate(rejectWorkOrderSchema),
  workOrderController.reject
);
router.post(
  '/:id/close',
  authorize(...WRITE_ROLES),
  validate(idParamSchema, 'params'),
  validate(closeWorkOrderSchema),
  workOrderController.close
);
router.post('/:id/reopen', authorize(...WRITE_ROLES), validate(idParamSchema, 'params'), workOrderController.reopen);

router.delete('/:id', authorize(...WRITE_ROLES), validate(idParamSchema, 'params'), workOrderController.remove);

export default router;
