import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import { validate } from '../../middlewares/validate';
import { WRITE_ROLES, REPORT_WRITE_ROLES } from '../../auth/roles';
import { laporanHarMpController } from './laporan-har-mp.controller';
import { laporanHarMpAttachmentController } from './laporan-har-mp-attachment';
import { laporanInspeksiMpController } from '../laporan-inspeksi-mp/laporan-inspeksi-mp.controller';
import {
  createLaporanHarMpSchema,
  updateLaporanHarMpSchema,
  decideLaporanHarMpSchema,
  listLaporanHarMpQuerySchema,
  idParamSchema,
} from './laporan-har-mp.validation';
import { searchGarduQuerySchema } from '../laporan-inspeksi-mp/laporan-inspeksi-mp.validation';

const TEMP_UPLOAD_DIR = path.join(process.cwd(), 'private-uploads', 'temp');
if (!fs.existsSync(TEMP_UPLOAD_DIR)) {
  fs.mkdirSync(TEMP_UPLOAD_DIR, { recursive: true });
}
const upload = multer({ dest: TEMP_UPLOAD_DIR, limits: { fileSize: 150 * 1024 * 1024 } });

const router = Router();
router.use(authenticate);

// Gardu Distribusi — sama untuk Inspeksi & HAR; reuse handler. Sebelum '/:id'.
router.get('/search-gardu', validate(searchGarduQuerySchema, 'query'), laporanInspeksiMpController.searchGardu);

router.get('/', validate(listLaporanHarMpQuerySchema, 'query'), laporanHarMpController.list);
router.get('/:id', validate(idParamSchema, 'params'), laporanHarMpController.getById);

router.post('/', authorize(...REPORT_WRITE_ROLES), validate(createLaporanHarMpSchema), laporanHarMpController.create);
router.put(
  '/:id',
  authorize(...REPORT_WRITE_ROLES),
  validate(idParamSchema, 'params'),
  validate(updateLaporanHarMpSchema),
  laporanHarMpController.update,
);
router.post(
  '/:id/submit',
  authorize(...REPORT_WRITE_ROLES),
  validate(idParamSchema, 'params'),
  laporanHarMpController.submit,
);

router.post(
  '/:id/validate',
  authorize(...WRITE_ROLES),
  validate(idParamSchema, 'params'),
  validate(decideLaporanHarMpSchema),
  laporanHarMpController.decide,
);

// --- Attachment Endpoints (SLD/Logger/Foto/Video) — mirror Laporan HAR GH ---
router.post(
  '/:id/attachments',
  authorize(...REPORT_WRITE_ROLES),
  validate(idParamSchema, 'params'),
  upload.single('file'),
  laporanHarMpAttachmentController.upload,
);
router.get('/:id/attachments', validate(idParamSchema, 'params'), laporanHarMpAttachmentController.list);
router.delete('/attachments/:attId', authorize(...REPORT_WRITE_ROLES), laporanHarMpAttachmentController.delete);
router.get('/attachments/:attId/download', laporanHarMpAttachmentController.download);
router.get('/attachments/:attId/thumbnail', laporanHarMpAttachmentController.thumbnail);

export default router;
