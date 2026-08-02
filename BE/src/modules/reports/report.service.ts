import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { env } from '../../config/env';
import prisma from '../../config/database';
import { reportRepository, ReportRepository } from './report.repository';
import { NotFoundError } from '../../utils/appError';
import { recordAuditLog } from '../../utils/auditLog';
import { buildReportPdf } from './report.pdf';
import { buildReportExcelToFile } from './report.excel';
import { buildReportModel, templateMetaFor, type SourceType, type ReportFormat } from './report.templates';
import { buildSignatureArtifacts, toSignatureBlock, sha256Hex } from './report.signature';
import { signatureService } from './signature.service';
import type { ListGeneratedQuery } from './report.validation';

const REPORTS_SUBDIR = 'documents';

const EXT: Record<ReportFormat, string> = { PDF: 'pdf', EXCEL: 'xlsx' };
const MIME: Record<ReportFormat, string> = {
  PDF: 'application/pdf',
  EXCEL: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export interface GenerateParams {
  sourceType: SourceType;
  sourceId: string;
  format: ReportFormat;
}

/**
 * Report Service — Enterprise Report Generator.
 *
 * Orchestrates: load source entity → normalise to a template ReportModel →
 * render to the requested format (PDF/Excel) → persist a versioned
 * GeneratedReport row. Download serves the stored file and records history.
 * Rendering lives in report.pdf.ts / report.excel.ts; data in the repository.
 */
export class ReportService {
  constructor(private readonly repo: ReportRepository = reportRepository) {}

  private reportsDir() {
    return path.join(process.cwd(), env.UPLOAD_DIR, REPORTS_SUBDIR);
  }

  private buildNumber(prefix: string, version: number) {
    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `${prefix}-${ymd}-${randomUUID().slice(0, 6).toUpperCase()}-V${version}`;
  }

  /** Unified entry point: generate a report for any source in any format. */
  async generate(params: GenerateParams, userId?: string) {
    const { sourceType, sourceId, format } = params;

    const entity = await this.repo.loadSource(sourceType, sourceId);
    if (!entity) throw new NotFoundError(`${sourceType} source not found`);

    const model = buildReportModel(sourceType, entity);
    const meta = templateMetaFor(sourceType);
    const version = await this.repo.nextVersion(sourceType, sourceId, format);
    const reportNumber = this.buildNumber(meta.numberPrefix, version);

    // Digital signature: build the signed token + QR BEFORE rendering so the
    // proof of authenticity is embedded in the artifact itself (offline-verifiable).
    const sigId = randomUUID();
    const signerName = await this.signerName(userId);
    const artifacts = await buildSignatureArtifacts({
      sigId,
      model,
      reportNumber,
      version,
      sourceType,
      sourceId,
      signedBy: userId ?? null,
    });
    const signatureBlock = toSignatureBlock(artifacts, signerName);

    const fileName = `report-${randomUUID()}.${EXT[format]}`;
    fs.mkdirSync(this.reportsDir(), { recursive: true });
    const absPath = path.join(this.reportsDir(), fileName);

    if (format === 'PDF') {
      const buffer = await buildReportPdf(model, reportNumber, signatureBlock);
      fs.writeFileSync(absPath, buffer);
    } else {
      await buildReportExcelToFile(model, reportNumber, absPath, signatureBlock);
    }
    const fileSize = fs.statSync(absPath).size;
    // Hash the rendered bytes for stored-file tamper detection (not signed).
    const fileHash = sha256Hex(fs.readFileSync(absPath));

    const generated = await this.repo.create(
      {
        locationId: model.locationId,
        reportNumber,
        reportType: sourceType, // back-compat: reportType mirrors the source
        format,
        sourceType,
        sourceId,
        version,
        title: model.title,
        templateKey: `${sourceType}_DEFAULT`,
        pdfUrl: `/uploads/${REPORTS_SUBDIR}/${fileName}`,
        fileSize,
      },
      userId,
    );

    await signatureService.createForReport({
      artifacts,
      reportId: generated.id,
      fileHash,
      signerName,
    });

    await recordAuditLog({
      entityType: 'GeneratedReport',
      entityId: generated.id,
      action: 'CREATE',
      newValue: { reportNumber, sourceType, sourceId, format, version, title: model.title, sigId, keyId: artifacts.keyId },
      performedBy: userId,
    });
    return generated;
  }

  /** Best-effort signer display name for the signature block. */
  private async signerName(userId?: string): Promise<string | null> {
    if (!userId) return null;
    try {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
      return user?.name ?? null;
    } catch {
      return null;
    }
  }

  // ── Back-compat thin wrappers (existing callers / routes) ────────────────
  generateInspection(inspectionId: string, userId?: string) {
    return this.generate({ sourceType: 'INSPECTION', sourceId: inspectionId, format: 'PDF' }, userId);
  }
  generateHar(harReportId: string, userId?: string) {
    return this.generate({ sourceType: 'HAR', sourceId: harReportId, format: 'PDF' }, userId);
  }

  async list(query: ListGeneratedQuery) {
    const { data, total, page, limit } = await this.repo.findAll(query);
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getById(id: string) {
    const report = await this.repo.findById(id);
    if (!report) throw new NotFoundError('Generated report not found');
    return report;
  }

  async downloadHistory(id: string) {
    await this.getById(id);
    return this.repo.listDownloads(id);
  }

  /**
   * Returns the stored report plus its absolute file path and HTTP metadata,
   * and records a download-history entry. `format` drives content-type/filename.
   */
  async getForDownload(id: string, downloadedBy?: string | null, ipAddress?: string | null) {
    const report = await this.getById(id);
    const fileName = report.pdfUrl.split('/').pop()!;
    const absPath = path.join(this.reportsDir(), fileName);
    if (!fs.existsSync(absPath)) {
      throw new NotFoundError('Report file is missing on the server');
    }
    const format = (report.format as ReportFormat) ?? 'PDF';
    await this.repo.recordDownload(id, downloadedBy, ipAddress);
    return {
      report,
      absPath,
      downloadName: `${report.reportNumber}.${EXT[format] ?? 'pdf'}`,
      contentType: MIME[format] ?? 'application/octet-stream',
    };
  }
}

export const reportService = new ReportService();
