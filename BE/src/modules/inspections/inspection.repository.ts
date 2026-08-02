import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { viaLocationScopeWhere, type TenantScope } from '../../utils/tenantScope';
import type {
  CreateInspectionInput,
  CreateFindingInput,
  ListInspectionQuery,
} from './inspection.validation';

const locationSelect = { select: { id: true, code: true, name: true } };
const inspectorSelect = { select: { id: true, name: true, email: true } };
const assetSelect = { select: { id: true, assetCode: true, assetName: true, assetType: true } };

/**
 * Inspection Repository — only layer touching Prisma for the inspection domain
 * (inspections, findings, photos). Inspections are transactional records, so no
 * soft delete (consistent with TDD: deletedAt only on master data).
 */
export class InspectionRepository {
  async findAll(query: ListInspectionQuery, scope: TenantScope) {
    const { page, limit, locationId, search, dateFrom, dateTo } = query;
    const skip = (page - 1) * limit;

    // Inclusive date range: lower bound at start-of-day, upper bound at
    // end-of-day so a single picked date still matches that whole day.
    let dateFilter: Prisma.DateTimeFilter | undefined;
    if (dateFrom || dateTo) {
      dateFilter = {};
      if (dateFrom) dateFilter.gte = new Date(`${dateFrom}T00:00:00.000`);
      if (dateTo) dateFilter.lte = new Date(`${dateTo}T23:59:59.999`);
    }

    const where: Prisma.InspectionWhereInput = {
      ...viaLocationScopeWhere(scope),
      ...(locationId ? { locationId } : {}),
      ...(dateFilter ? { inspectionDate: dateFilter } : {}),
      ...(search
        ? {
            location: {
              OR: [{ name: { contains: search, mode: 'insensitive' as const } }, { code: { contains: search, mode: 'insensitive' as const } }],
            },
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      prisma.inspection.findMany({
        where,
        skip,
        take: limit,
        orderBy: { inspectionDate: 'desc' },
        include: {
          location: locationSelect,
          inspector: inspectorSelect,
          _count: { select: { findings: true } },
        },
      }),
      prisma.inspection.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  findById(id: string, scope?: TenantScope) {
    return prisma.inspection.findFirst({
      where: { id, ...(scope ? viaLocationScopeWhere(scope) : {}) },
      include: {
        location: locationSelect,
        inspector: inspectorSelect,
        findings: {
          orderBy: { createdAt: 'asc' },
          include: { asset: assetSelect, photos: true },
        },
      },
    });
  }

  createInspection(data: CreateInspectionInput, inspectorId: string, userId?: string) {
    return prisma.inspection.create({
      data: {
        locationId: data.locationId,
        inspectionDate: new Date(data.inspectionDate),
        inspectorId,
        notes: data.notes ?? null,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
  }

  findFindingById(id: string) {
    return prisma.inspectionFinding.findUnique({
      where: { id },
      // Carry the owning RTUPP (finding → inspection → location) so the service
      // can enforce tenant scope before attaching a photo.
      include: { inspection: { select: { location: { select: { rtuppId: true } } } } },
    });
  }

  createFinding(inspectionId: string, data: CreateFindingInput, userId?: string) {
    return prisma.inspectionFinding.create({
      data: {
        inspectionId,
        assetId: data.assetId,
        status: data.status,
        finding: data.finding ?? null,
        recommendation: data.recommendation ?? null,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
      include: { asset: assetSelect },
    });
  }

  createPhoto(
    findingId: string,
    assetId: string,
    photoUrl: string,
    caption: string | null,
    userId?: string
  ) {
    return prisma.inspectionPhoto.create({
      data: {
        findingId,
        assetId,
        photoUrl,
        caption,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
  }
}

export const inspectionRepository = new InspectionRepository();
