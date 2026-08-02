import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { viaLocationScopeWhere, type TenantScope } from '../../utils/tenantScope';
import type {
  CreateHarReportInput,
  CreateHarDetailInput,
  UpdateHarDetailInput,
  ListHarQuery,
} from './har.validation';

const locationSelect = { select: { id: true, code: true, name: true } };
const assetSelect = { select: { id: true, assetCode: true, assetName: true, assetType: true } };

/**
 * HAR Repository — only layer touching Prisma for the HAR domain
 * (har_reports, har_details). Transactional records: no soft delete.
 */
export class HarRepository {
  async findAll(query: ListHarQuery, scope: TenantScope) {
    const { page, limit, locationId } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.HarReportWhereInput = {
      ...viaLocationScopeWhere(scope),
      ...(locationId ? { locationId } : {}),
    };

    const [data, total] = await Promise.all([
      prisma.harReport.findMany({
        where,
        skip,
        take: limit,
        orderBy: { reportDate: 'desc' },
        include: { location: locationSelect, _count: { select: { details: true } } },
      }),
      prisma.harReport.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  findById(id: string, scope?: TenantScope) {
    return prisma.harReport.findFirst({
      where: { id, ...(scope ? viaLocationScopeWhere(scope) : {}) },
      include: {
        location: locationSelect,
        details: { orderBy: { createdAt: 'asc' }, include: { asset: assetSelect } },
      },
    });
  }

  createReport(data: CreateHarReportInput, userId?: string) {
    return prisma.harReport.create({
      data: {
        locationId: data.locationId,
        reportDate: new Date(data.reportDate),
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
  }

  findDetailById(detailId: string) {
    return prisma.harDetail.findUnique({ where: { id: detailId } });
  }

  findDetailByReportAndAsset(harReportId: string, assetId: string) {
    return prisma.harDetail.findFirst({ where: { harReportId, assetId } });
  }

  createDetail(harReportId: string, data: CreateHarDetailInput, userId?: string) {
    return prisma.harDetail.create({
      data: {
        harReportId,
        assetId: data.assetId,
        status: data.status,
        analysis: data.analysis ?? null,
        notes: data.notes ?? null,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
      include: { asset: assetSelect },
    });
  }

  updateDetail(detailId: string, data: UpdateHarDetailInput, userId?: string) {
    return prisma.harDetail.update({
      where: { id: detailId },
      data: {
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.analysis !== undefined ? { analysis: data.analysis } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        updatedBy: userId ?? null,
      },
      include: { asset: assetSelect },
    });
  }

  deleteDetail(detailId: string) {
    return prisma.harDetail.delete({ where: { id: detailId } });
  }
}

export const harRepository = new HarRepository();
