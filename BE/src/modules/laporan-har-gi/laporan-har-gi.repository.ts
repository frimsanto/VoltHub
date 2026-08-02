import { Prisma, GiReportStatus } from '@prisma/client';
import prisma from '../../config/database';
import { viaLocationScopeWhere, type TenantScope } from '../../utils/tenantScope';
import type { ListLaporanHarGiQuery } from './laporan-har-gi.validation';

const harInclude = {
  location: { select: { id: true, code: true, name: true, locationType: true, up3: true, rtuppId: true } },
  feeder: { select: { id: true, feederCode: true, feederName: true } },
  asset: { select: { id: true, assetCode: true, assetName: true } },
  inspector: { select: { id: true, name: true, email: true } },
  workOrder: { select: { id: true, woNumber: true, status: true } },
} satisfies Prisma.LaporanHarGiInclude;

export interface ListLaporanHarGiOptions {
  /** Restrict to reports authored by this user (PETUGAS own-records view). */
  restrictToUserId?: string | null;
}

/**
 * Laporan HAR GI repository — Prisma access for `laporan_har_gi`. Reads exclude
 * soft-deleted and are tenant-scoped through the owning GI (location.rtuppId),
 * identical to the Laporan GI / Work Order modules.
 */
export class LaporanHarGiRepository {
  private notDeleted = { deletedAt: null } satisfies Prisma.LaporanHarGiWhereInput;

  async findAll(query: ListLaporanHarGiQuery, scope: TenantScope, opts: ListLaporanHarGiOptions = {}) {
    const { page, limit, search, status, locationId, workOrderId, dateFrom, dateTo } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.LaporanHarGiWhereInput = {
      ...this.notDeleted,
      ...viaLocationScopeWhere(scope),
      ...(opts.restrictToUserId ? { inspectorId: opts.restrictToUserId } : {}),
      ...(locationId ? { locationId } : {}),
      ...(workOrderId ? { workOrderId } : {}),
      ...(status ? { status } : {}),
      ...(dateFrom || dateTo
        ? { reportDate: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } }
        : {}),
      ...(search
        ? {
            OR: [
              { pelaksana: { contains: search, mode: 'insensitive' as const } },
              { pengawas: { contains: search, mode: 'insensitive' as const } },
              { location: { is: { name: { contains: search, mode: 'insensitive' as const } } } },
              { location: { is: { code: { contains: search, mode: 'insensitive' as const } } } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      prisma.laporanHarGi.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: harInclude,
      }),
      prisma.laporanHarGi.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  findById(id: string, scope?: TenantScope) {
    return prisma.laporanHarGi.findFirst({
      where: { id, ...this.notDeleted, ...(scope ? viaLocationScopeWhere(scope) : {}) },
      include: harInclude,
    });
  }

  create(data: Prisma.LaporanHarGiUncheckedCreateInput) {
    return prisma.laporanHarGi.create({ data, include: harInclude });
  }

  update(id: string, data: Prisma.LaporanHarGiUncheckedUpdateInput) {
    return prisma.laporanHarGi.update({ where: { id }, data, include: harInclude });
  }

  /**
   * Cascade dari approval Work Order → Laporan HAR GI tertaut yang masih SUBMITTED.
   * Hanya menyentuh laporan SUBMITTED (jangan ubah DRAFT/laporan lain).
   */
  cascadeStatusByWorkOrder(
    workOrderId: string,
    status: GiReportStatus,
    note: string | null,
    actorId?: string | null,
  ) {
    return prisma.laporanHarGi.updateMany({
      where: { workOrderId, status: 'SUBMITTED', deletedAt: null },
      data: {
        status,
        validatedAt: new Date(),
        validatedBy: actorId ?? null,
        ...(note != null ? { validationNote: note } : {}),
      },
    });
  }

  feederExists(id: string, locationId?: string) {
    return prisma.feeder.findFirst({
      where: { id, deletedAt: null, ...(locationId ? { locationId } : {}) },
      select: { id: true },
    });
  }

  /** WO lookup (tenant-scoped) for identity auto-fill. */
  workOrderById(id: string, scope: TenantScope) {
    return prisma.workOrder.findFirst({
      where: { id, deletedAt: null, ...viaLocationScopeWhere(scope) },
      select: {
        id: true,
        locationId: true,
        feederId: true,
        assetId: true,
        requiredReports: true,
        location: { select: { up3: true, rtuppId: true, locationType: true } },
        team: { select: { name: true } },
      },
    });
  }
}

export const laporanHarGiRepository = new LaporanHarGiRepository();
