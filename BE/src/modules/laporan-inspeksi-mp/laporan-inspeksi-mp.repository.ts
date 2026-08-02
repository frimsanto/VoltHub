import { Prisma, GiReportStatus } from '@prisma/client';
import prisma from '../../config/database';
import { viaLocationScopeWhere, locationScopeWhere, type TenantScope } from '../../utils/tenantScope';
import type { ListLaporanInspeksiMpQuery } from './laporan-inspeksi-mp.validation';

const mpInclude = {
  location: { select: { id: true, code: true, name: true, locationType: true, up3: true, rtuppId: true } },
  feeder: { select: { id: true, feederCode: true, feederName: true } },
  inspector: { select: { id: true, name: true, email: true } },
  workOrder: { select: { id: true, woNumber: true, status: true } },
} satisfies Prisma.LaporanInspeksiMpInclude;

// Historis dari import Excel (inspeksi_gardu_records, sumberFile GARDU_MP) —
// tidak ada WO/status alur; hanya kolom yang dipakai list+detail-modal FE.
const importedMpSelect = {
  id: true,
  tanggalPekerjaan: true,
  kodeGardu: true,
  up3: true,
  penyulang: true,
  pelaksana: true,
  statusScada: true,
  statusRc: true,
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
} satisfies Prisma.InspeksiGarduRecordSelect;

export type ImportedMpRecord = Prisma.InspeksiGarduRecordGetPayload<{ select: typeof importedMpSelect }>;

export interface ListLaporanInspeksiMpOptions {
  restrictToUserId?: string | null;
}

export class LaporanInspeksiMpRepository {
  private notDeleted = { deletedAt: null } satisfies Prisma.LaporanInspeksiMpWhereInput;

  private buildWhere(
    query: ListLaporanInspeksiMpQuery,
    scope: TenantScope,
    opts: ListLaporanInspeksiMpOptions,
  ): Prisma.LaporanInspeksiMpWhereInput {
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

  async findAll(query: ListLaporanInspeksiMpQuery, scope: TenantScope, opts: ListLaporanInspeksiMpOptions = {}) {
    const { page, limit } = query;
    const skip = (page - 1) * limit;
    const where = this.buildWhere(query, scope, opts);

    const [data, total] = await Promise.all([
      prisma.laporanInspeksiMp.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: mpInclude,
      }),
      prisma.laporanInspeksiMp.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  // Variant tanpa skip/take — dipakai saat list digabung dengan data import,
  // yang butuh sort+paginate ulang lintas dua sumber (lihat service.list()).
  findAllUnpaged(query: ListLaporanInspeksiMpQuery, scope: TenantScope, opts: ListLaporanInspeksiMpOptions = {}) {
    const where = this.buildWhere(query, scope, opts);
    return prisma.laporanInspeksiMp.findMany({ where, orderBy: { createdAt: 'desc' }, include: mpInclude });
  }

  // Data historis MP dari import Excel. Scope fail-closed via viaLocationScopeWhere:
  // record locationId null tidak match filter relasi utk scope ter-restrict → hanya
  // terlihat oleh MASTER/MANAGER (scope global).
  findImported(query: ListLaporanInspeksiMpQuery, scope: TenantScope) {
    const { search, locationId, dateFrom, dateTo } = query;
    const where: Prisma.InspeksiGarduRecordWhereInput = {
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

    return prisma.inspeksiGarduRecord.findMany({
      where,
      orderBy: { tanggalPekerjaan: 'desc' },
      select: importedMpSelect,
    });
  }

  findById(id: string, scope?: TenantScope) {
    return prisma.laporanInspeksiMp.findFirst({
      where: { id, ...this.notDeleted, ...(scope ? viaLocationScopeWhere(scope) : {}) },
      include: mpInclude,
    });
  }

  create(data: Prisma.LaporanInspeksiMpUncheckedCreateInput) {
    return prisma.laporanInspeksiMp.create({ data, include: mpInclude });
  }

  update(id: string, data: Prisma.LaporanInspeksiMpUncheckedUpdateInput) {
    return prisma.laporanInspeksiMp.update({ where: { id }, data, include: mpInclude });
  }

  cascadeStatusByWorkOrder(
    workOrderId: string,
    status: GiReportStatus,
    note: string | null,
    actorId?: string | null,
  ) {
    return prisma.laporanInspeksiMp.updateMany({
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

  // Pencarian Gardu Distribusi (GARDU) untuk dropdown, fail-closed RTUPP scope.
  // Beda dari GH: MP tidak punya banyak-feeder-per-lokasi — 1 gardu ≤1 feeder via
  // Location.supplyFeederId, jadi tak perlu pola "feedersByGh"; ini search bebas teks.
  async searchGardu(query: string, scope: TenantScope, limit = 20) {
    const gardus = await prisma.location.findMany({
      where: {
        locationType: 'GARDU',
        deletedAt: null,
        ...locationScopeWhere(scope),
        OR: [{ code: { contains: query, mode: 'insensitive' as const } }, { name: { contains: query, mode: 'insensitive' as const } }],
      },
      select: {
        id: true,
        code: true,
        name: true,
        up3: true,
        supplyFeederId: true,
        supplyFeeder: { select: { id: true, feederCode: true, feederName: true } },
      },
      orderBy: { code: 'asc' },
      take: limit,
    });
    return gardus;
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

export const laporanInspeksiMpRepository = new LaporanInspeksiMpRepository();
