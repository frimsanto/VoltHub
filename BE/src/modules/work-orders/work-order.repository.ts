import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { viaLocationScopeWhere, locationScopeWhere, type TenantScope } from '../../utils/tenantScope';
import type { ListWorkOrderQuery } from './work-order.validation';

const woInclude = {
  location: { select: { id: true, code: true, name: true, locationType: true, rtuppId: true } },
  bay: { select: { id: true, code: true, name: true } },
  feeder: { select: { id: true, feederCode: true, feederName: true } },
  asset: { select: { id: true, assetCode: true, assetName: true, assetType: true } },
  team: { select: { id: true, code: true, name: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.WorkOrderInclude;

export interface ListWorkOrderOptions {
  /** When set, restrict to WOs assigned to this team (PETUGAS own-records view). */
  restrictToTeamId?: string | null;
}

/**
 * WorkOrder Repository — Prisma access for `work_orders`. Reads exclude
 * soft-deleted and are tenant-scoped through the owning GI (location.rtuppId).
 */
export class WorkOrderRepository {
  private notDeleted = { deletedAt: null } satisfies Prisma.WorkOrderWhereInput;

  async findAll(query: ListWorkOrderQuery, scope: TenantScope, opts: ListWorkOrderOptions = {}) {
    const { page, limit, search, status, type, priority, locationId, teamId } = query;
    const skip = (page - 1) * limit;

    const teamFilter = opts.restrictToTeamId ? { teamId: opts.restrictToTeamId } : {};

    const where: Prisma.WorkOrderWhereInput = {
      ...this.notDeleted,
      ...viaLocationScopeWhere(scope),
      ...(locationId ? { locationId } : {}),
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
      ...(priority ? { priority } : {}),
      ...(teamId ? { teamId } : {}),
      ...teamFilter,
      ...(query.overdue
        ? {
            dueDate: { lt: new Date() },
            status: { notIn: ['APPROVED', 'CLOSED', 'REJECTED'] },
          }
        : {}),
      ...(search
        ? { OR: [{ woNumber: { contains: search, mode: 'insensitive' as const } }, { title: { contains: search, mode: 'insensitive' as const } }] }
        : {}),
    };

    const [data, total] = await Promise.all([
      prisma.workOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: woInclude,
      }),
      prisma.workOrder.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  findById(id: string, scope?: TenantScope) {
    return prisma.workOrder.findFirst({
      where: { id, ...this.notDeleted, ...(scope ? viaLocationScopeWhere(scope) : {}) },
      include: {
        ...woInclude,
        laporanAwal: { select: { id: true, reportId: true, status: true } },
        laporanAkhir: { select: { id: true, reportId: true, status: true } },
        attachments: { orderBy: { uploadedAt: 'desc' } },
      },
    });
  }

  // ── Laporan WO attachments (foto sebelum/sesudah) ──
  createAttachments(
    rows: {
      workOrderId: string;
      originalName: string;
      fileName: string;
      mimeType: string;
      size: number;
      path: string;
      category?: string | null;
      uploadedById?: string | null;
    }[],
  ) {
    return prisma.workOrderAttachment.createMany({ data: rows });
  }

  listAttachments(workOrderId: string) {
    return prisma.workOrderAttachment.findMany({
      where: { workOrderId },
      orderBy: { uploadedAt: 'desc' },
    });
  }

  attachmentById(id: string) {
    return prisma.workOrderAttachment.findUnique({ where: { id } });
  }

  deleteAttachment(id: string) {
    return prisma.workOrderAttachment.delete({ where: { id } });
  }

  findByNumber(woNumber: string) {
    return prisma.workOrder.findUnique({ where: { woNumber } });
  }

  create(data: Prisma.WorkOrderCreateInput) {
    return prisma.workOrder.create({ data, include: woInclude });
  }

  update(id: string, data: Prisma.WorkOrderUpdateInput) {
    return prisma.workOrder.update({ where: { id }, data, include: woInclude });
  }

  softDelete(id: string) {
    return prisma.workOrder.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  // ── FK existence checks (tenant-aware where relevant) ──
  locationExists(locationId: string, scope?: TenantScope) {
    return prisma.location.findFirst({
      where: { id: locationId, deletedAt: null, ...(scope ? locationScopeWhere(scope) : {}) },
      select: { id: true, locationType: true, rtuppId: true },
    });
  }

  bayExists(id: string, locationId: string) {
    return prisma.bay.findFirst({ where: { id, locationId, deletedAt: null }, select: { id: true } });
  }

  feederExists(id: string, locationId?: string) {
    return prisma.feeder.findFirst({
      where: { id, deletedAt: null, ...(locationId ? { locationId } : {}) },
      select: { id: true },
    });
  }

  assetExists(id: string, locationId?: string) {
    return prisma.asset.findFirst({
      where: { id, deletedAt: null, ...(locationId ? { locationId } : {}) },
      select: { id: true },
    });
  }

  teamExists(id: string) {
    return prisma.team.findUnique({ where: { id }, select: { id: true } });
  }

  /** Owning RTUPP of a team, for tenant-scope enforcement on assignment. */
  teamRtuppId(id: string) {
    return prisma.team
      .findUnique({ where: { id }, select: { rtuppId: true } })
      .then((t) => t?.rtuppId ?? null);
  }

  /** Actor's own team (for the PETUGAS own-team assignment check). */
  userTeamId(userId: string) {
    return prisma.user
      .findUnique({ where: { id: userId }, select: { teamId: true } })
      .then((u) => u?.teamId ?? null);
  }

  /** Actor's own RTUPP (for the ADMIN own-RTUPP list scoping in {@link WorkOrderService.list}). */
  userRtuppId(userId: string) {
    return prisma.user
      .findUnique({ where: { id: userId }, select: { rtuppId: true } })
      .then((u) => u?.rtuppId ?? null);
  }

  /** Active field-officer ids belonging to a team, for team-wide notifications. */
  async teamMemberIds(teamId: string): Promise<string[]> {
    const members = await prisma.user.findMany({
      where: { teamId, isActive: true, role: 'PETUGAS' },
      select: { id: true },
    });
    return members.map((m) => m.id);
  }

  /**
   * Gate penyelesaian: apakah WO ini sudah punya Laporan GI yang ter-submit
   * (SUBMITTED atau VALIDATED). Dipakai untuk memvalidasi requiredReports="GI".
   */
  async hasSubmittedGiReport(workOrderId: string): Promise<boolean> {
    const c = await prisma.laporanGi.count({
      where: { workOrderId, deletedAt: null, status: { in: ['SUBMITTED', 'VALIDATED'] } },
    });
    return c > 0;
  }

  /**
   * Gate penyelesaian: apakah WO ini sudah punya Laporan HAR GI yang ter-submit
   * (SUBMITTED atau VALIDATED). Dipakai untuk memvalidasi requiredReports="HAR".
   */
  async hasSubmittedHarReport(workOrderId: string): Promise<boolean> {
    const c = await prisma.laporanHarGi.count({
      where: { workOrderId, deletedAt: null, status: { in: ['SUBMITTED', 'VALIDATED'] } },
    });
    return c > 0;
  }

  /**
   * Gate penyelesaian: apakah WO ini sudah punya Laporan Inspeksi GH yang ter-submit
   * (SUBMITTED atau VALIDATED). Dipakai untuk memvalidasi requiredReports="INSPEKSI_GH".
   */
  async hasSubmittedInspeksiGhReport(workOrderId: string): Promise<boolean> {
    const c = await prisma.laporanInspeksiGh.count({
      where: { workOrderId, deletedAt: null, status: { in: ['SUBMITTED', 'VALIDATED'] } },
    });
    return c > 0;
  }

  /**
   * Gate penyelesaian: apakah WO ini sudah punya Laporan HAR GH yang ter-submit
   * (SUBMITTED atau VALIDATED). Dipakai untuk memvalidasi requiredReports="HAR_GH".
   */
  async hasSubmittedHarGhReport(workOrderId: string): Promise<boolean> {
    const c = await prisma.laporanHarGh.count({
      where: { workOrderId, deletedAt: null, status: { in: ['SUBMITTED', 'VALIDATED'] } },
    });
    return c > 0;
  }

  /**
   * Gate penyelesaian: apakah WO ini sudah punya Laporan Inspeksi MP yang ter-submit
   * (SUBMITTED atau VALIDATED). Dipakai untuk memvalidasi requiredReports="INSPEKSI_MP".
   */
  async hasSubmittedInspeksiMpReport(workOrderId: string): Promise<boolean> {
    const c = await prisma.laporanInspeksiMp.count({
      where: { workOrderId, deletedAt: null, status: { in: ['SUBMITTED', 'VALIDATED'] } },
    });
    return c > 0;
  }

  /**
   * Gate penyelesaian: apakah WO ini sudah punya Laporan HAR MP yang ter-submit
   * (SUBMITTED atau VALIDATED). Dipakai untuk memvalidasi requiredReports="HAR_MP".
   */
  async hasSubmittedHarMpReport(workOrderId: string): Promise<boolean> {
    const c = await prisma.laporanHarMp.count({
      where: { workOrderId, deletedAt: null, status: { in: ['SUBMITTED', 'VALIDATED'] } },
    });
    return c > 0;
  }

  // ── Aggregations for the operational dashboard ──
  private scopedWhere(scope: TenantScope): Prisma.WorkOrderWhereInput {
    return { ...this.notDeleted, ...viaLocationScopeWhere(scope) };
  }

  statusCounts(scope: TenantScope) {
    return prisma.workOrder.groupBy({
      by: ['status'],
      where: this.scopedWhere(scope),
      _count: { _all: true },
    });
  }

  typeCounts(scope: TenantScope) {
    return prisma.workOrder.groupBy({
      by: ['type'],
      where: this.scopedWhere(scope),
      _count: { _all: true },
    });
  }

  overdueCount(scope: TenantScope) {
    return prisma.workOrder.count({
      where: {
        ...this.scopedWhere(scope),
        dueDate: { lt: new Date() },
        status: { notIn: ['APPROVED', 'CLOSED', 'REJECTED'] },
      },
    });
  }

  teamTotals(scope: TenantScope) {
    return prisma.workOrder.groupBy({
      by: ['teamId'],
      where: { ...this.scopedWhere(scope), teamId: { not: null } },
      _count: { _all: true },
    });
  }

  teamClosed(scope: TenantScope) {
    return prisma.workOrder.groupBy({
      by: ['teamId'],
      where: { ...this.scopedWhere(scope), teamId: { not: null }, status: 'CLOSED' },
      _count: { _all: true },
    });
  }

  teamsByIds(ids: string[]) {
    return prisma.team.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, code: true } });
  }

  /**
   * RC/LR/ES outcome counts from the Laporan WO result (work_orders.hasil*),
   * tenant-scoped via the owning GI. `field` is one of hasilRC/hasilLR/hasilES.
   */
  checklistCounts(scope: TenantScope, field: 'hasilRC' | 'hasilLR' | 'hasilES') {
    return prisma.workOrder.groupBy({
      by: [field],
      where: { ...this.scopedWhere(scope), [field]: { not: null } },
      _count: { _all: true },
    });
  }
}

export const workOrderRepository = new WorkOrderRepository();
