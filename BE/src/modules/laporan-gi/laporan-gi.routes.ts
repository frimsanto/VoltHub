import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import { validate } from '../../middlewares/validate';
import { WRITE_ROLES, REPORT_WRITE_ROLES } from '../../auth/roles';
import { laporanGiController } from './laporan-gi.controller';
import { laporanGiAttachmentController } from './laporan-gi-attachment.controller';

const TEMP_UPLOAD_DIR = path.join(process.cwd(), 'private-uploads', 'temp');
if (!fs.existsSync(TEMP_UPLOAD_DIR)) {
  fs.mkdirSync(TEMP_UPLOAD_DIR, { recursive: true });
}
const upload = multer({
  dest: TEMP_UPLOAD_DIR,
  limits: {
    fileSize: 150 * 1024 * 1024 // 150MB
  }
});
import {
  createLaporanGiSchema,
  updateLaporanGiSchema,
  decideLaporanGiSchema,
  listLaporanGiQuerySchema,
  idParamSchema,
} from './laporan-gi.validation';

/**
 * Laporan GI routes — Inspeksi Teknis Lengkap Gardu Induk.
 * RBAC (samakan dengan modul GI/WO lain):
 *   read (list/detail)         = all authenticated (PETUGAS auto-restricted to own)
 *   create/update/submit       = MASTER, ADMIN, PETUGAS (field officer mengisi)
 *   validate (approve/reject)  = MASTER, ADMIN (approval admin)
 * Tenant isolation lewat location.rtuppId (fail-closed di service/repository).
 */
const router = Router();
router.use(authenticate);

router.get('/', validate(listLaporanGiQuerySchema, 'query'), laporanGiController.list);
router.get('/:id', validate(idParamSchema, 'params'), laporanGiController.getById);

router.post('/', authorize(...REPORT_WRITE_ROLES), validate(createLaporanGiSchema), laporanGiController.create);
router.put(
  '/:id',
  authorize(...REPORT_WRITE_ROLES),
  validate(idParamSchema, 'params'),
  validate(updateLaporanGiSchema),
  laporanGiController.update,
);
router.post(
  '/:id/submit',
  authorize(...REPORT_WRITE_ROLES),
  validate(idParamSchema, 'params'),
  laporanGiController.submit,
);

// Admin approval (validate = VALIDATED | REJECTED dalam satu endpoint, mirror FE).
router.post(
  '/:id/validate',
  authorize(...WRITE_ROLES),
  validate(idParamSchema, 'params'),
  validate(decideLaporanGiSchema),
  laporanGiController.decide,
);

// --- Attachment Endpoints (FASE C) ---
router.post(
  '/:id/attachments',
  authorize(...REPORT_WRITE_ROLES),
  validate(idParamSchema, 'params'),
  upload.single('file'),
  laporanGiAttachmentController.upload
);

router.get(
  '/:id/attachments',
  validate(idParamSchema, 'params'),
  laporanGiAttachmentController.list
);

router.delete(
  '/attachments/:attId',
  authorize(...REPORT_WRITE_ROLES),
  laporanGiAttachmentController.delete
);

router.get(
  '/attachments/:attId/download',
  laporanGiAttachmentController.download
);

router.get(
  '/attachments/:attId/thumbnail',
  laporanGiAttachmentController.thumbnail
);

export default router;
