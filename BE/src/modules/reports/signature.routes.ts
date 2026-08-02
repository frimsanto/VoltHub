import { Router } from 'express';
import { validate } from '../../middlewares/validate';
import { signatureController } from './signature.controller';
import { verifyTokenSchema, idParamSchema } from './signature.validation';

/**
 * PUBLIC verification routes — Digital Signature module (docs/DIGITAL_SIGNATURE.md).
 *
 * Mounted at /api/v1/verify with NO authentication: anyone scanning a report's
 * QR code (or pasting its token) must be able to verify authenticity & integrity
 * without an account. These endpoints expose no private key material and only
 * read/aggregate signature status.
 */
const router = Router();

// Published signing public key + fingerprint (for offline third-party verify).
router.get('/public-key', signatureController.publicKey);

// Verify a raw token (scanned QR payload).
router.post('/token', validate(verifyTokenSchema), signatureController.verifyToken);

// Verify by signature id (the QR/verification-page segment).
router.get('/:id', validate(idParamSchema, 'params'), signatureController.verifyById);

export default router;
