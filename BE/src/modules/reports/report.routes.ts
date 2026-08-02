import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import { validate } from '../../middlewares/validate';
import { reportController } from './report.controller';
import { signatureController } from './signature.controller';
import {
  generateSchema,
  generateInspectionSchema,
  generateHarSchema,
  listGeneratedQuerySchema,
  idParamSchema,
} from './report.validation';
import { revokeSchema } from './signature.validation';

import { REPORT_WRITE_ROLES as GENERATE_ROLES, WRITE_ROLES } from '../../auth/roles';

/**
 * Report routes — Enterprise Report Generator (docs/REPORT_GENERATOR.md).
 * RBAC: generate = ADMIN/PETUGAS (REPORT_WRITE_ROLES — MASTER excluded, pure
 * system administrator); list / download / history = any authenticated role.
 */
const router = Router();
router.use(authenticate);

// Unified generation: any source (Laporan Awal/Akhir, Inspection, HAR) × format.
router.post('/generate', authorize(...GENERATE_ROLES), validate(generateSchema), reportController.generate);

// Back-compat PDF endpoints.
router.post(
  '/generate/inspection',
  authorize(...GENERATE_ROLES),
  validate(generateInspectionSchema),
  reportController.generateInspection
);
router.post(
  '/generate/har',
  authorize(...GENERATE_ROLES),
  validate(generateHarSchema),
  reportController.generateHar
);

router.get('/generated', validate(listGeneratedQuerySchema, 'query'), reportController.listGenerated);
router.get(
  '/generated/:id/downloads',
  validate(idParamSchema, 'params'),
  reportController.downloadHistory
);
router.get('/generated/:id/download', validate(idParamSchema, 'params'), reportController.download);

// ── Digital signature (authenticated) — see /api/v1/verify/* for public verify ──
// Signature metadata for a generated report (token, hashes, verify URL, status).
router.get('/generated/:id/signature', validate(idParamSchema, 'params'), signatureController.getForReport);
// Revoke a report's signature (e.g. superseded / issued in error). ADMIN-tier.
router.post(
  '/signatures/:id/revoke',
  authorize(...WRITE_ROLES),
  validate(idParamSchema, 'params'),
  validate(revokeSchema),
  signatureController.revoke,
);

export default router;
