import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import { validate } from '../../middlewares/validate';
import { WRITE_ROLES, REPORT_WRITE_ROLES } from '../../auth/roles';
import { laporanInspeksiGhController } from './laporan-inspeksi-gh.controller';
import { laporanInspeksiGhAttachmentController } from './laporan-inspeksi-gh-attachment';
import {
  createLaporanInspeksiGhSchema,
  updateLaporanInspeksiGhSchema,
  decideLaporanInspeksiGhSchema,
  listLaporanInspeksiGhQuerySchema,
  feedersByGhQuerySchema,
  idParamSchema,
} from './laporan-inspeksi-gh.validation';

const TEMP_UPLOAD_DIR = path.join(process.cwd(), 'private-uploads', 'temp');
if (!fs.existsSync(TEMP_UPLOAD_DIR)) {
  fs.mkdirSync(TEMP_UPLOAD_DIR, { recursive: true });
}
const upload = multer({ dest: TEMP_UPLOAD_DIR, limits: { fileSize: 150 * 1024 * 1024 } });

const router = Router();
router.use(authenticate);

// Dropdown penyulang milik satu GH — didaftarkan sebelum '/:id' agar tidak ter-shadow.
router.get('/feeders', validate(feedersByGhQuerySchema, 'query'), laporanInspeksiGhController.feedersByGh);

router.get('/', validate(listLaporanInspeksiGhQuerySchema, 'query'), laporanInspeksiGhController.list);
router.get('/:id', validate(idParamSchema, 'params'), laporanInspeksiGhController.getById);

router.post('/', authorize(...REPORT_WRITE_ROLES), validate(createLaporanInspeksiGhSchema), laporanInspeksiGhController.create);
router.put(
  '/:id',
  authorize(...REPORT_WRITE_ROLES),
  validate(idParamSchema, 'params'),
  validate(updateLaporanInspeksiGhSchema),
  laporanInspeksiGhController.update,
);
router.post(
  '/:id/submit',
  authorize(...REPORT_WRITE_ROLES),
  validate(idParamSchema, 'params'),
  laporanInspeksiGhController.submit,
);

router.post(
  '/:id/validate',
  authorize(...WRITE_ROLES),
  validate(idParamSchema, 'params'),
  validate(decideLaporanInspeksiGhSchema),
  laporanInspeksiGhController.decide,
);

// --- Attachment Endpoints (SLD/Logger/Foto/Video) — mirror Laporan GI FASE C ---
router.post(
  '/:id/attachments',
  authorize(...REPORT_WRITE_ROLES),
  validate(idParamSchema, 'params'),
  upload.single('file'),
  laporanInspeksiGhAttachmentController.upload,
);
router.get('/:id/attachments', validate(idParamSchema, 'params'), laporanInspeksiGhAttachmentController.list);
router.delete('/attachments/:attId', authorize(...REPORT_WRITE_ROLES), laporanInspeksiGhAttachmentController.delete);
router.get('/attachments/:attId/download', laporanInspeksiGhAttachmentController.download);
router.get('/attachments/:attId/thumbnail', laporanInspeksiGhAttachmentController.thumbnail);

export default router;
