import prisma from '../../config/database';

export interface CreateSignatureData {
  id: string;
  reportId: string;
  reportNumber: string;
  sourceType: string;
  sourceId: string;
  version: number;
  algorithm: string;
  keyId: string;
  contentHash: string;
  fileHash: string;
  signature: string;
  payload: string;
  token: string;
  verifyUrl: string;
  issuer: string;
  signedBy: string | null;
  signerName: string | null;
}

/**
 * Signature Repository — Prisma access for report digital signatures: persist a
 * signature, look it up (by id, report, or report number) for verification, bump
 * verification telemetry, and apply revocation. The only layer touching Prisma.
 */
export class SignatureRepository {
  create(data: CreateSignatureData) {
    return prisma.reportSignature.create({ data });
  }

  findById(id: string) {
    return prisma.reportSignature.findUnique({
      where: { id },
      include: { report: { select: { id: true, format: true, pdfUrl: true, title: true, generatedAt: true } } },
    });
  }

  findByReportId(reportId: string) {
    return prisma.reportSignature.findUnique({ where: { reportId } });
  }

  findByReportNumber(reportNumber: string) {
    return prisma.reportSignature.findFirst({
      where: { reportNumber },
      include: { report: { select: { id: true, format: true, pdfUrl: true, title: true, generatedAt: true } } },
    });
  }

  async recordVerification(id: string) {
    await prisma.reportSignature.update({
      where: { id },
      data: { verifyCount: { increment: 1 }, lastVerifiedAt: new Date() },
    });
  }

  revoke(id: string, revokedBy: string | null, reason: string | null) {
    return prisma.reportSignature.update({
      where: { id },
      data: { status: 'REVOKED', revokedAt: new Date(), revokedBy, revokedReason: reason },
    });
  }
}

export const signatureRepository = new SignatureRepository();
