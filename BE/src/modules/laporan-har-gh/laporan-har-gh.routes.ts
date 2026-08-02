import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import { validate } from '../../middlewares/validate';
import { WRITE_ROLES, REPORT_WRITE_ROLES } from '../../auth/roles';
import { laporanHarGhController } from './laporan-har-gh.controller';
import { laporanHarGhAttachmentController } from './laporan-har-gh-attachment';
import { laporanInspeksiGhController } from '../laporan-inspeksi-gh/laporan-inspeksi-gh.controller';
import {
  createLaporanHarGhSchema,
  updateLaporanHarGhSchema,
  decideLaporanHarGhSchema,
  listLaporanHarGhQuerySchema,
  idParamSchema,
} from './laporan-har-gh.validation';
import { feedersByGhQuerySchema } from '../laporan-inspeksi-gh/laporan-inspeksi-gh.validation';

const TEMP_UPLOAD_DIR = path.join(process.cwd(), 'private-uploads', 'temp');
if (!fs.existsSync(TEMP_UPLOAD_DIR)) {
  fs.mkdirSync(TEMP_UPLOAD_DIR, { recursive: true });
}
const upload = multer({ dest: TEMP_UPLOAD_DIR, limits: { fileSize: 150 * 1024 * 1024 } });

const router = Router();
router.use(authenticate);

// Penyulang milik GH — sama untuk Inspeksi & HAR; reuse handler. Sebelum '/:id'.
router.get('/feeders', validate(feedersByGhQuerySchema, 'query'), laporanInspeksiGhController.feedersByGh);

router.get('/', validate(listLaporanHarGhQuerySchema, 'query'), laporanHarGhController.list);
router.get('/:id', validate(idParamSchema, 'params'), laporanHarGhController.getById);

router.post('/', authorize(...REPORT_WRITE_ROLES), validate(createLaporanHarGhSchema), laporanHarGhController.create);
router.put(
  '/:id',
  authorize(...REPORT_WRITE_ROLES),
  validate(idParamSchema, 'params'),
  validate(updateLaporanHarGhSchema),
  laporanHarGhController.update,
);
router.post(
  '/:id/submit',
  authorize(...REPORT_WRITE_ROLES),
  validate(idParamSchema, 'params'),
  laporanHarGhController.submit,
);

router.post(
  '/:id/validate',
  authorize(...WRITE_ROLES),
  validate(idParamSchema, 'params'),
  validate(decideLaporanHarGhSchema),
  laporanHarGhController.decide,
);

// --- Attachment Endpoints (SLD/Logger/Foto/Video) — mirror Laporan GI FASE C ---
router.post(
  '/:id/attachments',
  authorize(...REPORT_WRITE_ROLES),
  validate(idParamSchema, 'params'),
  upload.single('file'),
  laporanHarGhAttachmentController.upload,
);
router.get('/:id/attachments', validate(idParamSchema, 'params'), laporanHarGhAttachmentController.list);
router.delete('/attachments/:attId', authorize(...REPORT_WRITE_ROLES), laporanHarGhAttachmentController.delete);
router.get('/attachments/:attId/download', laporanHarGhAttachmentController.download);
router.get('/attachments/:attId/thumbnail', laporanHarGhAttachmentController.thumbnail);

export default router;
