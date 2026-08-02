import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import { validate } from '../../middlewares/validate';
import {
  SCADA_UPLOAD_ROLES,
  SCADA_RTU_READ_ROLES,
  SCADA_LINES_READ_ROLES,
} from '../../auth/roles';
import { scadaUploadController } from './scada-upload.controller';
import {
  uploadBodySchema,
  latestQuerySchema,
  rtuQuerySchema,
  linesQuerySchema,
} from './scada-upload.validation';

// In-memory multer for the SP7 exports (same policy as the import engine):
// .xlsx/.xls only, parsed from buffer, never persisted to disk.
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
 * SCADA snapshot routes (Siemens SP7 daily export).
 *
 * RBAC:
 *   upload + history — MASTER, MANAGER, NOC (the NOC team owns the daily
 *     export; MASTER/MANAGER may stand in).
 *   RTU read   — every role (the Inscan/OOP dashboard is the shared
 *     operational picture, incl. PETUGAS in the field).
 *   Lines read — monitoring tiers + NOC (channel/IFS detail, no PETUGAS).
 */
const router = Router();

router.use(authenticate);

router.post(
  '/upload',
  authorize(...SCADA_UPLOAD_ROLES),
  uploadXlsx.single('file'),
  validate(uploadBodySchema),
  scadaUploadController.upload
);

router.get(
  '/snapshot/latest',
  authorize(...SCADA_RTU_READ_ROLES),
  validate(latestQuerySchema, 'query'),
  scadaUploadController.latest
);

router.get(
  '/rtu',
  authorize(...SCADA_RTU_READ_ROLES),
  validate(rtuQuerySchema, 'query'),
  scadaUploadController.listRtu
);

router.get(
  '/lines',
  authorize(...SCADA_LINES_READ_ROLES),
  validate(linesQuerySchema, 'query'),
  scadaUploadController.listLines
);

router.get('/upload-history', authorize(...SCADA_UPLOAD_ROLES), scadaUploadController.history);

export default router;
