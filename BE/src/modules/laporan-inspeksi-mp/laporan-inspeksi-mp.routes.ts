import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import { validate } from '../../middlewares/validate';
import { WRITE_ROLES, REPORT_WRITE_ROLES } from '../../auth/roles';
import { laporanInspeksiMpController } from './laporan-inspeksi-mp.controller';
import { laporanInspeksiMpAttachmentController } from './laporan-inspeksi-mp-attachment';
import {
  createLaporanInspeksiMpSchema,
  updateLaporanInspeksiMpSchema,
  decideLaporanInspeksiMpSchema,
  listLaporanInspeksiMpQuerySchema,
  searchGarduQuerySchema,
  idParamSchema,
} from './laporan-inspeksi-mp.validation';

const TEMP_UPLOAD_DIR = path.join(process.cwd(), 'private-uploads', 'temp');
if (!fs.existsSync(TEMP_UPLOAD_DIR)) {
  fs.mkdirSync(TEMP_UPLOAD_DIR, { recursive: true });
}
const upload = multer({ dest: TEMP_UPLOAD_DIR, limits: { fileSize: 150 * 1024 * 1024 } });

const router = Router();
router.use(authenticate);

// Dropdown Gardu Distribusi — didaftarkan sebelum '/:id' agar tidak ter-shadow.
router.get('/search-gardu', validate(searchGarduQuerySchema, 'query'), laporanInspeksiMpController.searchGardu);

router.get('/', validate(listLaporanInspeksiMpQuerySchema, 'query'), laporanInspeksiMpController.list);
router.get('/:id', validate(idParamSchema, 'params'), laporanInspeksiMpController.getById);

router.post('/', authorize(...REPORT_WRITE_ROLES), validate(createLaporanInspeksiMpSchema), laporanInspeksiMpController.create);
router.put(
  '/:id',
  authorize(...REPORT_WRITE_ROLES),
  validate(idParamSchema, 'params'),
  validate(updateLaporanInspeksiMpSchema),
  laporanInspeksiMpController.update,
);
router.post(
  '/:id/submit',
  authorize(...REPORT_WRITE_ROLES),
  validate(idParamSchema, 'params'),
  laporanInspeksiMpController.submit,
);

router.post(
  '/:id/validate',
  authorize(...WRITE_ROLES),
  validate(idParamSchema, 'params'),
  validate(decideLaporanInspeksiMpSchema),
  laporanInspeksiMpController.decide,
);

// --- Attachment Endpoints (SLD/Logger/Foto/Video) — mirror Laporan Inspeksi GH ---
router.post(
  '/:id/attachments',
  authorize(...REPORT_WRITE_ROLES),
  validate(idParamSchema, 'params'),
  upload.single('file'),
  laporanInspeksiMpAttachmentController.upload,
);
router.get('/:id/attachments', validate(idParamSchema, 'params'), laporanInspeksiMpAttachmentController.list);
router.delete('/attachments/:attId', authorize(...REPORT_WRITE_ROLES), laporanInspeksiMpAttachmentController.delete);
router.get('/attachments/:attId/download', laporanInspeksiMpAttachmentController.download);
router.get('/attachments/:attId/thumbnail', laporanInspeksiMpAttachmentController.thumbnail);

export default router;
