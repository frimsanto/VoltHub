import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { 
  uploadMultiple, 
  uploadAllInOne,
  uploadLaporanAkhirCategorized,
  handleUploadError 
} from '../middlewares/uploadMiddleware';
import * as controller from '../controllers/uploadController';

const router = Router();

// Apply auth to all routes
router.use(authenticate);

// All-in-One Documentation Upload (50 files, Images + Videos)
router.post(
  '/:jenis/all-in-one',
  uploadAllInOne,
  handleUploadError,
  controller.uploadFiles
);

// Categorized Upload for Laporan Akhir (Logger, SLD, Dokumentasi Hasil)
router.post(
  '/laporan-akhir/categorized',
  uploadLaporanAkhirCategorized,
  handleUploadError,
  controller.uploadCategorizedFiles
);

// Legacy Upload files (20 files)
router.post(
  '/:jenis',
  uploadMultiple,
  handleUploadError,
  controller.uploadFiles
);

// Get attachments by laporan
router.get('/laporan/:jenis/:laporanId', controller.getAttachmentsByLaporan);

// Get/preview/download single attachment
router.get('/:id', controller.getAttachment);

// Preview attachment (public)
router.get('/preview/:id', controller.previewAttachment);

// Delete attachment
router.delete('/:id', controller.deleteAttachment);

export default router;
