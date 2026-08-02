import { Prisma, GiReportStatus } from '@prisma/client';
import prisma from '../../config/database';
import { viaLocationScopeWhere, type TenantScope } from '../../utils/tenantScope';
import type { ListLaporanGiQuery } from './laporan-gi.validation';

const giInclude = {
  location: { select: { id: true, code: true, name: true, locationType: true, up3: true, rtuppId: true } },
  feeder: { select: { id: true, feederCode: true, feederName: true } },
  inspector: { select: { id: true, name: true, email: true } },
  workOrder: { select: { id: true, woNumber: true, status: true } },
} satisfies Prisma.LaporanGiInclude;

export interface ListLaporanGiOptions {
  /** Restrict to reports authored by this user (PETUGAS own-records view). */
  restrictToUserId?: string | null;
}

/**
 * Laporan GI repository — Prisma access for `laporan_gi`. Reads exclude
 * soft-deleted and are tenant-scoped through the owning GI (location.rtuppId),
 * identical to the Work Order / Inspection modules.
 */
export class LaporanGiRepository {
  private notDeleted = { deletedAt: null } satisfies Prisma.LaporanGiWhereInput;

  async findAll(query: ListLaporanGiQuery, scope: TenantScope, opts: ListLaporanGiOptions = {}) {
    const { page, limit, search, status, locationId, workOrderId, dateFrom, dateTo } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.LaporanGiWhereInput = {
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
              { location: { is: { name: { contains: search, mode: 'insensitive' as const } } } },
              { location: { is: { code: { contains: search, mode: 'insensitive' as const } } } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      prisma.laporanGi.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: giInclude,
      }),
      prisma.laporanGi.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  findById(id: string, scope?: TenantScope) {
    return prisma.laporanGi.findFirst({
      where: { id, ...this.notDeleted, ...(scope ? viaLocationScopeWhere(scope) : {}) },
      include: giInclude,
    });
  }

  create(data: Prisma.LaporanGiUncheckedCreateInput) {
    return prisma.laporanGi.create({ data, include: giInclude });
  }

  update(id: string, data: Prisma.LaporanGiUncheckedUpdateInput) {
    return prisma.laporanGi.update({ where: { id }, data, include: giInclude });
  }

  /**
   * Cascade dari approval Work Order → Laporan GI tertaut yang masih SUBMITTED.
   * Hanya menyentuh laporan SUBMITTED (jangan ubah DRAFT/laporan lain).
   */
  cascadeStatusByWorkOrder(
    workOrderId: string,
    status: GiReportStatus,
    note: string | null,
    actorId?: string | null,
  ) {
    return prisma.laporanGi.updateMany({
      where: { workOrderId, status: 'SUBMITTED', deletedAt: null },
      data: {
        status,
        validatedAt: new Date(),
        validatedBy: actorId ?? null,
        ...(note != null ? { validationNote: note } : {}),
      },
    });
  }

  // ── FK existence / scope checks ──
  /** Location lookup WITHOUT tenant filter — caller compares rtuppId to give a
   *  precise 403 (cross-RTUPP) vs 404 (not found). */
  locationById(id: string) {
    return prisma.location.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, locationType: true, up3: true, rtuppId: true },
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
        requiredReports: true,
        location: { select: { up3: true, rtuppId: true, locationType: true } },
        team: { select: { name: true } },
      },
    });
  }
}

export const laporanGiRepository = new LaporanGiRepository();
