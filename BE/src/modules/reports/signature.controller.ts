import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { successResponse } from '../../utils/response';
import { signatureService } from './signature.service';
import type { VerifyTokenInput, RevokeInput } from './signature.validation';

/**
 * Signature Controller — Digital Signature module.
 * Public handlers (verify by id / token, public key) carry no auth; the revoke
 * and per-report signature lookups are mounted behind auth in report.routes.
 */
export class SignatureController {
  /** PUBLIC — verify a report by its signature id (QR / verification page). */
  verifyById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await signatureService.verifyById(req.params.id);
      successResponse(res, result, 'Verification completed');
    } catch (err) {
      next(err);
    }
  };

  /** PUBLIC — verify a raw token (e.g. pasted/scanned QR payload). */
  verifyToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { token } = req.body as VerifyTokenInput;
      const result = await signatureService.verifyTokenString(token);
      successResponse(res, result, 'Verification completed');
    } catch (err) {
      next(err);
    }
  };

  /** PUBLIC — published Ed25519 public key + fingerprint for offline verification. */
  publicKey = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      successResponse(res, signatureService.publicKey(), 'Signing public key');
    } catch (err) {
      next(err);
    }
  };

  /** AUTH — signature metadata for a generated report. */
  getForReport = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sig = await signatureService.getForReport(req.params.id);
      successResponse(res, sig, 'Signature retrieved');
    } catch (err) {
      next(err);
    }
  };

  /** AUTH (ADMIN) — revoke a signature. */
  revoke = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { reason } = (req.body ?? {}) as RevokeInput;
      const updated = await signatureService.revoke(req.params.id, req.user?.userId ?? null, reason);
      successResponse(res, updated, 'Signature revoked');
    } catch (err) {
      next(err);
    }
  };
}

export const signatureController = new SignatureController();
