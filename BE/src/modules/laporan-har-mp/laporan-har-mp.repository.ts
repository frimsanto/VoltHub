import { Prisma, GiReportStatus } from '@prisma/client';
import prisma from '../../config/database';
import { viaLocationScopeWhere, type TenantScope } from '../../utils/tenantScope';
import type { ListLaporanHarMpQuery } from './laporan-har-mp.validation';

const mpInclude = {
  location: { select: { id: true, code: true, name: true, locationType: true, up3: true, rtuppId: true } },
  feeder: { select: { id: true, feederCode: true, feederName: true } },
  inspector: { select: { id: true, name: true, email: true } },
  workOrder: { select: { id: true, woNumber: true, status: true } },
} satisfies Prisma.LaporanHarMpInclude;

// Historis dari import Excel (har_gardu_records, sumberFile GARDU_MP) —
// tidak ada WO/status alur; hanya kolom yang dipakai list+detail-modal FE.
const importedHarMpSelect = {
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

export type ImportedHarMpRecord = Prisma.HarGarduRecordGetPayload<{ select: typeof importedHarMpSelect }>;

export interface ListLaporanHarMpOptions {
  restrictToUserId?: string | null;
}

export class LaporanHarMpRepository {
  private notDeleted = { deletedAt: null } satisfies Prisma.LaporanHarMpWhereInput;

  private buildWhere(
    query: ListLaporanHarMpQuery,
    scope: TenantScope,
    opts: ListLaporanHarMpOptions,
  ): Prisma.LaporanHarMpWhereInput {
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

  async findAll(query: ListLaporanHarMpQuery, scope: TenantScope, opts: ListLaporanHarMpOptions = {}) {
    const { page, limit } = query;
    const skip = (page - 1) * limit;
    const where = this.buildWhere(query, scope, opts);

    const [data, total] = await Promise.all([
      prisma.laporanHarMp.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: mpInclude,
      }),
      prisma.laporanHarMp.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  // Variant tanpa skip/take — dipakai saat list digabung dengan data import,
  // yang butuh sort+paginate ulang lintas dua sumber (lihat service.list()).
  findAllUnpaged(query: ListLaporanHarMpQuery, scope: TenantScope, opts: ListLaporanHarMpOptions = {}) {
    const where = this.buildWhere(query, scope, opts);
    return prisma.laporanHarMp.findMany({ where, orderBy: { createdAt: 'desc' }, include: mpInclude });
  }

  // Data historis HAR MP dari import Excel. Scope fail-closed via viaLocationScopeWhere:
  // record locationId null tidak match filter relasi utk scope ter-restrict → hanya
  // terlihat oleh MASTER/MANAGER (scope global).
  findImported(query: ListLaporanHarMpQuery, scope: TenantScope) {
    const { search, locationId, dateFrom, dateTo } = query;
    const where: Prisma.HarGarduRecordWhereInput = {
      sumberFile: 'GARDU_MP',
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
      select: importedHarMpSelect,
    });
  }

  findById(id: string, scope?: TenantScope) {
    return prisma.laporanHarMp.findFirst({
      where: { id, ...this.notDeleted, ...(scope ? viaLocationScopeWhere(scope) : {}) },
      include: mpInclude,
    });
  }

  create(data: Prisma.LaporanHarMpUncheckedCreateInput) {
    return prisma.laporanHarMp.create({ data, include: mpInclude });
  }

  update(id: string, data: Prisma.LaporanHarMpUncheckedUpdateInput) {
    return prisma.laporanHarMp.update({ where: { id }, data, include: mpInclude });
  }

  cascadeStatusByWorkOrder(
    workOrderId: string,
    status: GiReportStatus,
    note: string | null,
    actorId?: string | null,
  ) {
    return prisma.laporanHarMp.updateMany({
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
        requiredReports: true,
        location: { select: { up3: true, rtuppId: true, locationType: true, supplyFeederId: true } },
        team: { select: { name: true } },
      },
    });
  }
}

export const laporanHarMpRepository = new LaporanHarMpRepository();
