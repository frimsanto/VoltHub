import fs from 'fs';
import path from 'path';
import { env } from '../../config/env';
import { NotFoundError, ValidationError } from '../../utils/appError';
import { recordAuditLog } from '../../utils/auditLog';
import { signatureRepository, SignatureRepository, CreateSignatureData } from './signature.repository';
import { getPublicKeyInfo } from './signature.keys';
import { verifyToken, sha256Hex, type SignatureArtifacts } from './report.signature';

const REPORTS_SUBDIR = 'documents';

export type VerifyStatus = 'VALID' | 'REVOKED' | 'TAMPERED' | 'INVALID_SIGNATURE' | 'NOT_FOUND';

export interface VerifyResult {
  valid: boolean;
  status: VerifyStatus;
  /** Ed25519 signature over the signed payload checks out. */
  signatureValid: boolean;
  /** Stored rendered file still matches the signed-at file hash (null if unavailable). */
  contentIntact: boolean | null;
  signature?: {
    sigId: string;
    reportNumber: string;
    sourceType: string;
    version: number;
    algorithm: string;
    keyId: string;
    issuer: string;
    signerName: string | null;
    signedAt: string;
    revokedAt: string | null;
    revokedReason: string | null;
  };
  report?: { id: string; title: string | null; format: string; generatedAt: string };
  verifiedAt: string;
}

/**
 * Signature Service — Digital Signature module.
 *
 * Persists a report's signature at generation time and answers verification
 * queries. Verification combines three independent checks: (1) Ed25519 token
 * authenticity (offline-capable, via the published public key), (2) revocation
 * status from the DB, and (3) rendered-file integrity (re-hash the stored file
 * vs the signed `fileHash`). Spec: docs/DIGITAL_SIGNATURE.md.
 */
export class SignatureService {
  constructor(private readonly repo: SignatureRepository = signatureRepository) {}

  private reportsDir() {
    return path.join(process.cwd(), env.UPLOAD_DIR, REPORTS_SUBDIR);
  }

  /** Persist the signature produced for a freshly rendered report. */
  createForReport(params: {
    artifacts: SignatureArtifacts;
    reportId: string;
    fileHash: string;
    signerName: string | null;
  }) {
    const { artifacts: a, reportId, fileHash, signerName } = params;
    const data: CreateSignatureData = {
      id: a.sigId,
      reportId,
      reportNumber: a.payload.reportNumber,
      sourceType: a.payload.sourceType,
      sourceId: a.payload.sourceId,
      version: a.payload.version,
      algorithm: a.algorithm,
      keyId: a.keyId,
      contentHash: a.contentHash,
      fileHash,
      signature: a.signatureB64,
      payload: a.payloadB64,
      token: a.token,
      verifyUrl: a.verifyUrl,
      issuer: a.issuer,
      signedBy: a.payload.signedBy,
      signerName,
    };
    return this.repo.create(data);
  }

  /** Recompute the stored file's hash; null when the file is unavailable. */
  private fileHashFor(pdfUrl: string): string | null {
    const fileName = pdfUrl.split('/').pop();
    if (!fileName) return null;
    const abs = path.join(this.reportsDir(), fileName);
    if (!fs.existsSync(abs)) return null;
    return sha256Hex(fs.readFileSync(abs));
  }

  /** Public verification by signature id (the QR/verify-page segment). */
  async verifyById(sigId: string): Promise<VerifyResult> {
    const sig = await this.repo.findById(sigId);
    if (!sig) {
      return { valid: false, status: 'NOT_FOUND', signatureValid: false, contentIntact: null, verifiedAt: new Date().toISOString() };
    }

    const { signatureValid } = verifyToken(sig.token);

    let contentIntact: boolean | null = null;
    if (sig.report?.pdfUrl) {
      const current = this.fileHashFor(sig.report.pdfUrl);
      contentIntact = current === null ? null : current === sig.fileHash;
    }

    let status: VerifyStatus = 'VALID';
    if (!signatureValid) status = 'INVALID_SIGNATURE';
    else if (sig.status === 'REVOKED') status = 'REVOKED';
    else if (contentIntact === false) status = 'TAMPERED';

    await this.repo.recordVerification(sigId).catch(() => undefined);

    return {
      valid: status === 'VALID',
      status,
      signatureValid,
      contentIntact,
      signature: {
        sigId: sig.id,
        reportNumber: sig.reportNumber,
        sourceType: sig.sourceType,
        version: sig.version,
        algorithm: sig.algorithm,
        keyId: sig.keyId,
        issuer: sig.issuer,
        signerName: sig.signerName,
        signedAt: sig.signedAt.toISOString(),
        revokedAt: sig.revokedAt ? sig.revokedAt.toISOString() : null,
        revokedReason: sig.revokedReason,
      },
      report: sig.report
        ? { id: sig.report.id, title: sig.report.title, format: sig.report.format, generatedAt: sig.report.generatedAt.toISOString() }
        : undefined,
      verifiedAt: new Date().toISOString(),
    };
  }

  /**
   * Verify a raw token string (e.g. pasted from a QR scan). Crypto-validates the
   * token offline, then resolves the matching signature row to layer revocation
   * and file-integrity checks on top when available.
   */
  async verifyTokenString(token: string): Promise<VerifyResult> {
    const parsed = verifyToken(token);
    if (!parsed.payload) {
      return { valid: false, status: 'INVALID_SIGNATURE', signatureValid: false, contentIntact: null, verifiedAt: new Date().toISOString() };
    }
    // Resolve the canonical record to enrich the verdict (and apply revocation).
    return this.verifyById(parsed.payload.sigId);
  }

  /** Authenticated lookup of a report's signature metadata (no private material). */
  async getForReport(reportId: string) {
    const sig = await this.repo.findByReportId(reportId);
    if (!sig) throw new NotFoundError('No signature found for this report');
    return {
      sigId: sig.id,
      reportNumber: sig.reportNumber,
      algorithm: sig.algorithm,
      keyId: sig.keyId,
      contentHash: sig.contentHash,
      fileHash: sig.fileHash,
      token: sig.token,
      verifyUrl: sig.verifyUrl,
      issuer: sig.issuer,
      signerName: sig.signerName,
      status: sig.status,
      signedAt: sig.signedAt.toISOString(),
      verifyCount: sig.verifyCount,
    };
  }

  /** Revoke a signature (e.g. erroneous or superseded report). Admin-only. */
  async revoke(sigId: string, userId: string | null, reason?: string | null) {
    const sig = await this.repo.findById(sigId);
    if (!sig) throw new NotFoundError('Signature not found');
    if (sig.status === 'REVOKED') throw new ValidationError('Signature is already revoked');

    const updated = await this.repo.revoke(sigId, userId, reason ?? null);
    await recordAuditLog({
      entityType: 'ReportSignature',
      entityId: sigId,
      action: 'STATUS_CHANGE',
      oldValue: { status: 'VALID' },
      newValue: { status: 'REVOKED', reason: reason ?? null },
      performedBy: userId,
    });
    return updated;
  }

  /** Published public key + fingerprint so third parties verify tokens offline. */
  publicKey() {
    return getPublicKeyInfo();
  }
}

export const signatureService = new SignatureService();
