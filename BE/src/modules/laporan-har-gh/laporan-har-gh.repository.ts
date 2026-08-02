import { Prisma, GiReportStatus } from '@prisma/client';
import prisma from '../../config/database';
import { viaLocationScopeWhere, type TenantScope } from '../../utils/tenantScope';
import type { ListLaporanHarGhQuery } from './laporan-har-gh.validation';

const ghInclude = {
  location: { select: { id: true, code: true, name: true, locationType: true, up3: true, rtuppId: true } },
  feeder: { select: { id: true, feederCode: true, feederName: true } },
  inspector: { select: { id: true, name: true, email: true } },
  workOrder: { select: { id: true, woNumber: true, status: true } },
} satisfies Prisma.LaporanHarGhInclude;

// Historis dari import Excel (har_gardu_records, sumberFile GARDU_HUBUNG) —
// tidak ada WO/status alur; hanya kolom yang dipakai list+detail-modal FE.
const importedHarGhSelect = {
  id: true,
  tanggalPekerjaan: true,
  jenisPekerjaan: true,
  kodeGardu: true,
  up3: true,
  penyulang: true,
  pelaksana: true,
  statusScada: true,
  statusRc: true,
  statusPekerjaan: true,
  penyebabGangguan: true,
  analisaGangguan: true,
  catatan: true,
  kesimpulanRectifier: true,
  keteranganRectifier: true,
  kesimpulanBaterai: true,
  keteranganBaterai: true,
  kesimpulanRtu: true,
  keteranganRtu: true,
  kesimpulanMedia: true,
  keteranganMedia: true,
  locationId: true,
  createdAt: true,
  location: { select: { id: true, code: true, name: true, locationType: true, up3: true } },
} satisfies Prisma.HarGarduRecordSelect;

export type ImportedHarGhRecord = Prisma.HarGarduRecordGetPayload<{ select: typeof importedHarGhSelect }>;

export interface ListLaporanHarGhOptions {
  restrictToUserId?: string | null;
}

export class LaporanHarGhRepository {
  private notDeleted = { deletedAt: null } satisfies Prisma.LaporanHarGhWhereInput;

  private buildWhere(
    query: ListLaporanHarGhQuery,
    scope: TenantScope,
    opts: ListLaporanHarGhOptions,
  ): Prisma.LaporanHarGhWhereInput {
    const { search, status, locationId, workOrderId, dateFrom, dateTo } = query;
    return {
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
  }

  async findAll(query: ListLaporanHarGhQuery, scope: TenantScope, opts: ListLaporanHarGhOptions = {}) {
    const { page, limit } = query;
    const skip = (page - 1) * limit;
    const where = this.buildWhere(query, scope, opts);

    const [data, total] = await Promise.all([
      prisma.laporanHarGh.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: ghInclude,
      }),
      prisma.laporanHarGh.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  // Variant tanpa skip/take — dipakai saat list digabung dengan data import,
  // yang butuh sort+paginate ulang lintas dua sumber (lihat service.list()).
  findAllUnpaged(query: ListLaporanHarGhQuery, scope: TenantScope, opts: ListLaporanHarGhOptions = {}) {
    const where = this.buildWhere(query, scope, opts);
    return prisma.laporanHarGh.findMany({ where, orderBy: { createdAt: 'desc' }, include: ghInclude });
  }

  // Data historis HAR GH dari import Excel. Scope fail-closed via viaLocationScopeWhere:
  // record locationId null tidak match filter relasi utk scope ter-restrict → hanya
  // terlihat oleh MASTER/MANAGER (scope global).
  findImported(query: ListLaporanHarGhQuery, scope: TenantScope) {
    const { search, locationId, dateFrom, dateTo } = query;
    const where: Prisma.HarGarduRecordWhereInput = {
      sumberFile: 'GARDU_HUBUNG',
      ...viaLocationScopeWhere(scope),
      ...(locationId ? { locationId } : {}),
      ...(dateFrom || dateTo
        ? { tanggalPekerjaan: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } }
        : {}),
      ...(search
        ? {
            OR: [
              { kodeGardu: { contains: search, mode: 'insensitive' as const } },
              { up3: { contains: search, mode: 'insensitive' as const } },
              { pelaksana: { contains: search, mode: 'insensitive' as const } },
              { location: { is: { name: { contains: search, mode: 'insensitive' as const } } } },
              { location: { is: { code: { contains: search, mode: 'insensitive' as const } } } },
            ],
          }
        : {}),
    };

    return prisma.harGarduRecord.findMany({
      where,
      orderBy: { tanggalPekerjaan: 'desc' },
      select: importedHarGhSelect,
    });
  }

  findById(id: string, scope?: TenantScope) {
    return prisma.laporanHarGh.findFirst({
      where: { id, ...this.notDeleted, ...(scope ? viaLocationScopeWhere(scope) : {}) },
      include: ghInclude,
    });
  }

  create(data: Prisma.LaporanHarGhUncheckedCreateInput) {
    return prisma.laporanHarGh.create({ data, include: ghInclude });
  }

  update(id: string, data: Prisma.LaporanHarGhUncheckedUpdateInput) {
    return prisma.laporanHarGh.update({ where: { id }, data, include: ghInclude });
  }

  cascadeStatusByWorkOrder(
    workOrderId: string,
    status: GiReportStatus,
    note: string | null,
    actorId?: string | null,
  ) {
    return prisma.laporanHarGh.updateMany({
      where: { workOrderId, status: 'SUBMITTED', deletedAt: null },
      data: {
        status,
        validatedAt: new Date(),
        validatedBy: actorId ?? null,
        ...(note != null ? { validationNote: note } : {}),
      },
    });
  }

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

export const laporanHarGhRepository = new LaporanHarGhRepository();
