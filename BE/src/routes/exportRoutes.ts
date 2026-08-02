import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import * as controller from '../controllers/exportController';

const router = Router();

router.use(authenticate);

// Export single laporan as ZIP
// GET /api/export/zip/awal/:id
// GET /api/export/zip/akhir/:id
router.get('/zip/:jenis/:id', controller.exportZip);

// Export history as XLSX
// GET /api/export/xlsx/history?jenis=ALL&status=PENDING&startDate=2026-01-01&endDate=2026-01-31
router.get('/xlsx/history', controller.exportXlsx);

export default router;
