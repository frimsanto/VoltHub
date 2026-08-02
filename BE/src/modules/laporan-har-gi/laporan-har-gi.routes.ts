import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import { validate } from '../../middlewares/validate';
import { WRITE_ROLES, REPORT_WRITE_ROLES } from '../../auth/roles';
import { laporanHarGiController } from './laporan-har-gi.controller';
import {
  createLaporanHarGiSchema,
  updateLaporanHarGiSchema,
  decideLaporanHarGiSchema,
  listLaporanHarGiQuerySchema,
  idParamSchema,
} from './laporan-har-gi.validation';

/**
 * Laporan HAR GI routes — Laporan Korektif/Pemeliharaan Gardu Induk (FASE B).
 * RBAC (samakan dengan Laporan GI / WO):
 *   read (list/detail)         = all authenticated (PETUGAS auto-restricted to own)
 *   create/update/submit       = MASTER, ADMIN, PETUGAS (field officer mengisi)
 *   validate (approve/reject)  = MASTER, ADMIN (approval admin; ber-WO → lewat WO)
 * Tenant isolation lewat location.rtuppId (fail-closed di service/repository).
 */
const router = Router();
router.use(authenticate);

router.get('/', validate(listLaporanHarGiQuerySchema, 'query'), laporanHarGiController.list);
router.get('/:id', validate(idParamSchema, 'params'), laporanHarGiController.getById);

router.post('/', authorize(...REPORT_WRITE_ROLES), validate(createLaporanHarGiSchema), laporanHarGiController.create);
router.put(
  '/:id',
  authorize(...REPORT_WRITE_ROLES),
  validate(idParamSchema, 'params'),
  validate(updateLaporanHarGiSchema),
  laporanHarGiController.update,
);
router.post(
  '/:id/submit',
  authorize(...REPORT_WRITE_ROLES),
  validate(idParamSchema, 'params'),
  laporanHarGiController.submit,
);

// Admin approval standalone (ber-WO ditolak → lewat Work Order, cascade LANGKAH 3).
router.post(
  '/:id/validate',
  authorize(...WRITE_ROLES),
  validate(idParamSchema, 'params'),
  validate(decideLaporanHarGiSchema),
  laporanHarGiController.decide,
);

export default router;
