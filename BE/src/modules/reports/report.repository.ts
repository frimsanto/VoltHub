import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import type { ListGeneratedQuery } from './report.validation';
import type { SourceType } from './report.templates';

const locationSelect = { select: { id: true, code: true, name: true } };
const assetSelect = { select: { id: true, assetCode: true, assetName: true, assetType: true } };

export interface CreateGeneratedData {
  locationId: string | null;
  reportNumber: string;
  reportType: string;
  format: string;
  sourceType: string;
  sourceId: string;
  version: number;
  title: string;
  templateKey: string;
  pdfUrl: string;
  fileSize: number;
}

/**
 * Report Repository — Prisma access for the Enterprise Report Generator:
 * loads each source entity (for normalisation), persists generated_reports rows
 * with versioning, and records the per-download audit trail.
 */
export class ReportRepository {
  // ── Source loaders (read existing report entities) ───────────────────────

  loadSource(sourceType: SourceType, id: string): Promise<unknown> {
    switch (sourceType) {
      case 'LAPORAN_AWAL':
        return prisma.laporanAwal.findUnique({ where: { id } });
      case 'LAPORAN_AKHIR':
        return prisma.laporanAkhir.findUnique({ where: { id } });
      case 'INSPECTION':
        return prisma.inspection.findUnique({
          where: { id },
          include: {
            location: locationSelect,
            inspector: { select: { id: true, name: true } },
            findings: { orderBy: { createdAt: 'asc' }, include: { asset: assetSelect, photos: true } },
          },
        });
      case 'HAR':
        return prisma.harReport.findUnique({
          where: { id },
          include: {
            location: locationSelect,
            details: { orderBy: { createdAt: 'asc' }, include: { asset: assetSelect } },
          },
        });
    }
  }

  /** Next immutable version for (sourceType, sourceId, format) = prior count + 1. */
  async nextVersion(sourceType: string, sourceId: string, format: string): Promise<number> {
    const count = await prisma.generatedReport.count({ where: { sourceType, sourceId, format } });
    return count + 1;
  }

  // ── Generated artifacts ──────────────────────────────────────────────────

  async findAll(query: ListGeneratedQuery) {
    const { page, limit, locationId, reportType, sourceType, sourceId, format } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.GeneratedReportWhereInput = {
      ...(locationId ? { locationId } : {}),
      ...(reportType ? { reportType } : {}),
      ...(sourceType ? { sourceType } : {}),
      ...(sourceId ? { sourceId } : {}),
      ...(format ? { format } : {}),
    };

    const [data, total] = await Promise.all([
      prisma.generatedReport.findMany({
        where,
        skip,
        take: limit,
        orderBy: { generatedAt: 'desc' },
        include: { location: locationSelect, _count: { select: { downloads: true } } },
      }),
      prisma.generatedReport.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  findById(id: string) {
    return prisma.generatedReport.findUnique({
      where: { id },
      include: { location: locationSelect, _count: { select: { downloads: true } } },
    });
  }

  create(data: CreateGeneratedData, generatedBy?: string) {
    return prisma.generatedReport.create({
      data: {
        locationId: data.locationId,
        reportNumber: data.reportNumber,
        reportType: data.reportType,
        format: data.format,
        sourceType: data.sourceType,
        sourceId: data.sourceId,
        version: data.version,
        title: data.title,
        templateKey: data.templateKey,
        pdfUrl: data.pdfUrl,
        fileSize: data.fileSize,
        generatedBy: generatedBy ?? null,
      },
    });
  }

  // ── Download history ─────────────────────────────────────────────────────

  /** Record a download and bump the cached counter in one transaction. */
  async recordDownload(reportId: string, downloadedBy?: string | null, ipAddress?: string | null) {
    await prisma.$transaction([
      prisma.reportDownload.create({
        data: { reportId, downloadedBy: downloadedBy ?? null, ipAddress: ipAddress ?? null },
      }),
      prisma.generatedReport.update({
        where: { id: reportId },
        data: { downloadCount: { increment: 1 } },
      }),
    ]);
  }

  listDownloads(reportId: string, limit = 50) {
    return prisma.reportDownload.findMany({
      where: { reportId },
      orderBy: { downloadedAt: 'desc' },
      take: limit,
    });
  }
}

export const reportRepository = new ReportRepository();
