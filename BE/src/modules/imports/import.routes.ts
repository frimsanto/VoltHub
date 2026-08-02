import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import { validate } from '../../middlewares/validate';
import { WRITE_ROLES } from '../../auth/roles';
import { importController } from './import.controller';
import { listJobsQuerySchema, idParamSchema } from './import.validation';

// Dedicated in-memory multer for spreadsheet imports (parsed from buffer, then
// persisted by the service). Accepts .xlsx / .xls only.
const XLSX_MIMES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream',
];
const uploadXlsx = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (XLSX_MIMES.includes(file.mimetype) || /\.xlsx?$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Only .xlsx / .xls files are allowed'));
    }
  },
});

/**
 * Import Engine routes (EPIC-8). Admin tooling for bulk data load →
 * restricted to master-data write roles (SUPER_ADMIN, ADMIN). Performance
 * import is the ONLY write path for performance data (BR-010/011).
 */
const router = Router();
router.use(authenticate);
router.use(authorize(...WRITE_ROLES));

router.post('/assets', uploadXlsx.single('file'), importController.importAssets);
// EPIC-8 Import Engine: Gardu (Story 24), Performance (Story 25), Asset (Story 26).
router.post('/sites', uploadXlsx.single('file'), importController.importGardu);
router.post('/gardu', uploadXlsx.single('file'), importController.importGardu); // alias
router.post('/performance', uploadXlsx.single('file'), importController.importPerformance);
// Live monitoring: SCADA RTU state from periodic IFS export (updates assets, creates none).
router.post('/scada/rtu-state', uploadXlsx.single('file'), importController.importScadaRtuState);
router.get('/jobs', validate(listJobsQuerySchema, 'query'), importController.listJobs);
router.get('/jobs/:id', validate(idParamSchema, 'params'), importController.getJob);
router.get('/jobs/:id/errors', validate(idParamSchema, 'params'), importController.getJobErrors);

export default router;
