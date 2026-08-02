/**
 * PHASE 9 — VoltHub Query Services (the ONLY data door for the Brain).
 *
 * Every method:
 *   - receives the caller's AiContext (role + already-resolved TenantScope),
 *   - applies the SAME tenant-scope predicates the rest of the app uses
 *     (locationScopeWhere / viaLocationScopeWhere), so MASTER/MANAGER/ADMIN
 *     see all, PETUGAS sees only their RTUPP and own reports,
 *   - returns a small, render-ready shape (no raw rows, no PII dumps).
 *
 * No business logic is duplicated — this is read aggregation over Prisma using
 * the canonical scope helpers (the identical approach as ai.repository.ts).
 * These functions are reached ONLY through the Allowed Query Registry (Phase 8).
 */

import type { Prisma, AssetType, ReportStatus } from '@prisma/client';
import prisma from '../../../../config/database';
import { assetRepository } from '../../../assets/asset.repository';
import { locationScopeWhere, viaLocationScopeWhere } from '../../../../utils/tenantScope';
import { isFieldOfficer } from '../../../../auth/roles';
import type { AiContext, IntentSlots } from '../brain.types';

// ── Concept → DB value mappings ─────────────────────────────────────────────
const ENTITY_TO_ASSET_TYPES: Record<string, AssetType[]> = {
  'entity.router': ['ROUTER', 'MODEM', 'RADIO'],
  'entity.rtu': ['RTU'],
  'entity.battery': ['BATTERY_BANK'],
  'entity.rectifier': ['RECTIFIER'],
};

function assetStatusWhere(status?: string): Prisma.AssetWhereInput {
  switch (status) {
    case 'status.offline':
      return { operState: 'DOWN' };
    case 'status.online':
      return { operState: 'UP' };
    case 'status.damaged':
      return { status: 'DAMAGED' };
    case 'status.warning':
      return { status: 'WARNING' };
    case 'status.critical':
      return { status: { in: ['WARNING', 'DAMAGED'] } };
    default:
      return {};
  }
}

function reportStatusValue(status?: string): ReportStatus | undefined {
  switch (status) {
    case 'status.pending':
      return 'PENDING';
    case 'status.approved':
      return 'APPROVED';
    case 'status.rejected':
      return 'REJECTED';
    default:
      return undefined;
  }
}

function timeWindowStart(time?: string): Date | undefined {
  const now = new Date();
  switch (time) {
    case 'time.today': {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case 'time.yesterday': {
      const d = new Date(now);
      d.setDate(d.getDate() - 1);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case 'time.this_week': {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return d;
    }
    case 'time.this_month': {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return d;
    }
    default:
      return undefined;
  }
}

const LIST_LIMIT = 20;

/**
 * The equipment-condition verdict on InspeksiGarduRecord lives in the
 * `kesimpulan<Komponen>` columns (BAIK / RUSAK / PERLU PENGECEKAN LANJUT) —
 * NOT `kategori<Komponen>`, which holds a separate, more granular non-normal
 * classification code (e.g. "SUMBER TEGANGAN TIDAK ADA") that does not
 * reliably contain the word "RUSAK". Confirmed against the imported data.
 */
const INSPEKSI_KESIMPULAN_FIELDS = [
  'kesimpulanRectifier',
  'kesimpulanBaterai',
  'kesimpulanRtu',
  'kesimpulanMedia',
] as const;

function kesimpulanValuesFor(status?: string): string[] {
  switch (status) {
    case 'status.critical':
    case 'status.damaged':
      return ['RUSAK'];
    case 'status.warning':
      return ['PERLU PENGECEKAN LANJUT'];
    default:
      return ['RUSAK', 'PERLU PENGECEKAN LANJUT'];
  }
}

/**
 * Best-effort point extraction from a SiteGeometry GeoJSON string — used only as
 * a fallback when Location.latitude/longitude are unset. The table currently has
 * no writer, so this is defensive ("jika ada"), not the primary coordinate source.
 */
function extractPointFromGeometry(raw: string): { lat: number; lng: number } | null {
  try {
    const geo = JSON.parse(raw);
    const g = geo?.type === 'Feature' ? geo.geometry : geo;
    const coords: unknown =
      g?.type === 'Point' ? g.coordinates : g?.type === 'Polygon' ? g.coordinates?.[0]?.[0] : undefined;
    if (Array.isArray(coords) && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      return { lng: coords[0], lat: coords[1] };
    }
  } catch {
    // Malformed/empty geometry — no fallback available.
  }
  return null;
}

class AiQueryServices {
  // ── assets.search ─────────────────────────────────────────────────────────
  async searchAssets(ctx: AiContext, slots: IntentSlots) {
    const scope = ctx.scope;
    const where: Prisma.AssetWhereInput = {
      deletedAt: null,
      ...viaLocationScopeWhere(scope),
      ...assetStatusWhere(slots.status),
    };

    const types = slots.entity ? ENTITY_TO_ASSET_TYPES[slots.entity] : undefined;
    if (types) where.assetType = { in: types };

    if (slots.status === 'status.uninspected') {
      // "belum inspeksi": assets whose owning location has no inspection record.
      where.location = {
        ...(scope.global ? {} : { rtuppId: scope.rtuppId }),
        inspections: { none: {} },
      };
    }

    if (slots.keyword) {
      where.OR = [
        { assetCode: { contains: slots.keyword, mode: 'insensitive' as const } },
        { assetName: { contains: slots.keyword, mode: 'insensitive' as const } },
      ];
    }

    // Explicit gardu code → filter by the OWNING LOCATION's code ("aset di
    // GH0033"); asset codes/names don't embed the gardu code, so the keyword
    // OR above can't cover this. Merged over any location filter set earlier
    // (tenant scope / uninspected) so neither is lost.
    if (slots.locationCode) {
      const existing = (where.location ?? {}) as Prisma.LocationWhereInput;
      where.location = { ...existing, code: { contains: slots.locationCode, mode: 'insensitive' as const } };
    }

    const [total, items] = await Promise.all([
      prisma.asset.count({ where }),
      prisma.asset.findMany({
        where,
        take: LIST_LIMIT,
        orderBy: { assetCode: 'asc' },
        select: {
          assetCode: true,
          assetName: true,
          assetType: true,
          status: true,
          operState: true,
          location: { select: { code: true, name: true } },
        },
      }),
    ]);

    return {
      kind: 'assets' as const,
      total,
      shown: items.length,
      items: items.map((a) => ({
        code: a.assetCode,
        name: a.assetName,
        type: a.assetType,
        status: a.status,
        comm: a.operState,
        gardu: a.location?.code ?? null,
      })),
    };
  }

  // ── reports.search ────────────────────────────────────────────────────────
  async searchReports(ctx: AiContext, slots: IntentSlots) {
    const scope = ctx.scope;
    const status = reportStatusValue(slots.status);
    const since = timeWindowStart(slots.time);

    // Tenant scope for reports = creator's RTUPP; PETUGAS = own records only.
    const creatorWhere: Prisma.UserWhereInput | undefined = scope.global
      ? undefined
      : { rtuppId: scope.rtuppId };

    const where: Prisma.LaporanAwalWhereInput = {
      ...(status ? { status } : {}),
      ...(since ? { createdAt: { gte: since } } : {}),
      ...(isFieldOfficer(ctx.role) ? { createdById: ctx.userId } : creatorWhere ? { createdBy: creatorWhere } : {}),
    };

    const [total, items] = await Promise.all([
      prisma.laporanAwal.count({ where }),
      prisma.laporanAwal.findMany({
        where,
        take: LIST_LIMIT,
        orderBy: { createdAt: 'desc' },
        select: {
          reportId: true,
          lokasiGardu: true,
          pekerjaan: true,
          status: true,
          tanggal: true,
          up3: true,
        },
      }),
    ]);

    return {
      kind: 'reports' as const,
      total,
      shown: items.length,
      items: items.map((r) => ({
        id: r.reportId,
        gardu: r.lokasiGardu,
        pekerjaan: r.pekerjaan?.slice(0, 80),
        status: r.status,
        tanggal: r.tanggal,
        up3: r.up3,
      })),
    };
  }

  // ── kpi.count ─────────────────────────────────────────────────────────────
  async count(ctx: AiContext, slots: IntentSlots) {
    const scope = ctx.scope;
    const entity = slots.entity ?? 'entity.gardu';

    switch (entity) {
      case 'entity.gardu': {
        // Filter status inscan/oop → hitung BARIS individual scada_rtu_rows
        // dari snapshot SP7 RTU terbaru (assetRepository.latestScadaRtuStatusCounts,
        // sumber yang sama dengan Dashboard SCADA — lih. asset.service.scadaRtuSummary),
        // BUKAN header totalUp/totalDown yang dihitung saat upload dan bisa salah,
        // dan BUKAN tabel locations yang tidak tahu status komunikasi. Snapshot
        // upload NOC bersifat global — tidak ada scoping RTUPP, sama seperti dashboard.
        if (
          slots.status === 'status.online' ||
          slots.status === 'status.offline' ||
          slots.status === 'status.all_rc'
        ) {
          const statusRows = await assetRepository.latestScadaRtuStatusCounts();
          const label =
            slots.status === 'status.online' ? 'RTU Inscan (UP)'
            : slots.status === 'status.offline' ? 'RTU OOP (DOWN)'
            : 'RTU RC (Inscan/OOP)';
          let up = 0;
          let down = 0;
          let total = 0;
          for (const r of statusRows ?? []) {
            const n = r._count._all;
            if (r.operState === 'UP') up += n;
            else if (r.operState === 'DOWN') down += n;
            total += n; // termasuk LISTEN dsb. — bukan UP/DOWN
          }
          if (!statusRows || total === 0) {
            return {
              kind: 'count' as const,
              label,
              total: 0,
              meta: { note: 'Data SCADA belum tersedia. Minta tim NOC upload file SP7 terbaru.' },
            };
          }
          if (slots.status === 'status.all_rc') {
            return {
              kind: 'count' as const,
              label,
              total,
              meta: { up, down, totalRtu: total },
            };
          }
          return {
            kind: 'count' as const,
            label,
            total: slots.status === 'status.online' ? up : down,
            context: `dari ${total.toLocaleString('id-ID')} total RTU di snapshot SP7`,
          };
        }
        // Tanpa filter status → total gardu dari registry (perilaku lama).
        return this.wrapCount('gardu', await prisma.location.count({
          where: { deletedAt: null, ...locationScopeWhere(scope) },
        }));
      }
      case 'entity.feeder':
        return this.wrapCount('penyulang', await prisma.feeder.count({
          where: { ...viaLocationScopeWhere(scope) },
        }));
      case 'entity.asset':
      case 'entity.router':
      case 'entity.rtu':
      case 'entity.battery':
      case 'entity.rectifier': {
        const types = ENTITY_TO_ASSET_TYPES[entity];
        return this.wrapCount(
          'aset',
          await prisma.asset.count({
            where: {
              deletedAt: null,
              ...viaLocationScopeWhere(scope),
              ...assetStatusWhere(slots.status),
              ...(types ? { assetType: { in: types } } : {}),
            },
          })
        );
      }
      case 'entity.report':
      case 'entity.inspection': {
        const status = reportStatusValue(slots.status);
        const creatorWhere = scope.global ? undefined : { rtuppId: scope.rtuppId };
        return this.wrapCount(
          'laporan',
          await prisma.laporanAwal.count({
            where: {
              ...(status ? { status } : {}),
              ...(isFieldOfficer(ctx.role)
                ? { createdById: ctx.userId }
                : creatorWhere
                  ? { createdBy: creatorWhere }
                  : {}),
            },
          })
        );
      }
      case 'entity.ticket':
        return this.wrapCount('tiket', await prisma.ticket.count({
          where: { deletedAt: null, ...viaLocationScopeWhere(scope) },
        }));
      case 'entity.user':
        // User counts follow the tenant scope: scoped roles see own RTUPP only.
        return this.wrapCount('pengguna', await prisma.user.count({
          where: scope.global ? {} : { rtuppId: scope.rtuppId },
        }));
      default:
        return this.wrapCount('gardu', await prisma.location.count({
          where: { deletedAt: null, ...locationScopeWhere(scope) },
        }));
    }
  }

  private wrapCount(label: string, total: number) {
    return { kind: 'count' as const, label, total };
  }

  // ── gis.search (by place) ─────────────────────────────────────────────────
  async searchByPlace(ctx: AiContext, slots: IntentSlots) {
    const scope = ctx.scope;
    // An explicit code is the most precise qualifier (the OR below already
    // matches `code contains`); free-text place/keyword are the fallback.
    const place = slots.locationCode ?? slots.place ?? slots.keyword;
    const where: Prisma.LocationWhereInput = {
      deletedAt: null,
      ...locationScopeWhere(scope),
      ...(place
        ? {
            OR: [
              { name: { contains: place, mode: 'insensitive' as const } },
              { address: { contains: place, mode: 'insensitive' as const } },
              { up3: { contains: place, mode: 'insensitive' as const } },
              { code: { contains: place, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      prisma.location.count({ where }),
      prisma.location.findMany({
        where,
        take: LIST_LIMIT,
        orderBy: { code: 'asc' },
        select: {
          code: true,
          name: true,
          locationType: true,
          up3: true,
          latitude: true,
          longitude: true,
          _count: { select: { assets: true } },
        },
      }),
    ]);

    return {
      kind: 'gardu' as const,
      place: place ?? null,
      total,
      shown: items.length,
      items: items.map((l) => ({
        code: l.code,
        name: l.name,
        type: l.locationType,
        up3: l.up3,
        assetCount: l._count.assets,
        hasGeo: l.latitude != null && l.longitude != null,
      })),
    };
  }

  // ── gis.detail (single gardu lookup) ──────────────────────────────────────
  async locationDetail(ctx: AiContext, slots: IntentSlots) {
    const scope = ctx.scope;
    const query = (slots.locationCode ?? slots.keyword ?? slots.place ?? '').trim();

    const where: Prisma.LocationWhereInput = {
      deletedAt: null,
      ...locationScopeWhere(scope),
      ...(query ? { OR: [{ code: { contains: query, mode: 'insensitive' as const } }, { name: { contains: query, mode: 'insensitive' as const } }] } : {}),
    };

    const location = await prisma.location.findFirst({
      where,
      orderBy: { code: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        up3: true,
        address: true,
        latitude: true,
        longitude: true,
        rtupp: { select: { code: true, name: true } },
        siteGeometries: { take: 1, orderBy: { createdAt: 'desc' }, select: { geometry: true } },
      },
    });

    if (!location) {
      return { kind: 'location' as const, found: false as const, query: query || null };
    }

    // RC status per-gardu — attached only when the question actually asks about
    // RC/OOP/inscan (an RC-ish status slot). Status comes from the latest SP7
    // RTU snapshot (the authoritative RC source); %AVA YTD comes from
    // scada_gardu (workbook availability) because scada_rtu_rows has no AVA
    // column. Match by the ingest-time location link first, then by rtuName
    // (Siemens naming usually embeds the gardu code; MySQL contains is
    // case-insensitive by collation).
    let rcStatus:
      | { status: string; avaYtd: string | null; asOf: string | null }
      | undefined;
    const asksRc =
      slots.status === 'status.offline' ||
      slots.status === 'status.online' ||
      slots.status === 'status.all_rc';
    if (asksRc) {
      const latestSnapshot = await prisma.scadaSnapshot.findFirst({
        where: { fileType: 'RTU' },
        orderBy: { uploadedAt: 'desc' },
        select: { id: true, uploadedAt: true },
      });
      if (latestSnapshot) {
        const [rtu, ava] = await Promise.all([
          prisma.scadaRtuRow.findFirst({
            where: {
              snapshotId: latestSnapshot.id,
              OR: [{ locationId: location.id }, { rtuName: { contains: location.code } }],
            },
            select: { operState: true },
          }),
          prisma.scadaGardu.findFirst({
            where: { code: location.code },
            select: { avaYtd: true },
          }),
        ]);
        const avaYtd = ava?.avaYtd != null ? `${(ava.avaYtd * 100).toFixed(2)}%` : null;
        const asOf = latestSnapshot.uploadedAt.toISOString().slice(0, 10);
        rcStatus = rtu
          ? { status: rtu.operState === 'UP' ? 'IN-SCAN' : 'OOP', avaYtd, asOf }
          : { status: 'Tidak ada data RC', avaYtd, asOf };
      }
    }

    let lat = location.latitude != null ? Number(location.latitude) : null;
    let lng = location.longitude != null ? Number(location.longitude) : null;
    if ((lat == null || lng == null) && location.siteGeometries[0]?.geometry) {
      const point = extractPointFromGeometry(location.siteGeometries[0].geometry);
      if (point) {
        lat = lat ?? point.lat;
        lng = lng ?? point.lng;
      }
    }

    return {
      kind: 'location' as const,
      found: true as const,
      query: query || null,
      code: location.code,
      name: location.name,
      up3: location.up3,
      rtupp: location.rtupp ? { code: location.rtupp.code, name: location.rtupp.name } : null,
      address: location.address,
      lat,
      lng,
      ...(rcStatus ? { rcStatus } : {}),
    };
  }

  // ── insight.top (aggregate) ───────────────────────────────────────────────
  async topProblematic(ctx: AiContext, slots: IntentSlots) {
    const scope = ctx.scope;

    // Group damaged/warning/offline assets by their owning location's UP3.
    const where: Prisma.AssetWhereInput = {
      deletedAt: null,
      ...viaLocationScopeWhere(scope),
      ...(slots.status ? assetStatusWhere(slots.status) : { OR: [{ status: { in: ['WARNING', 'DAMAGED'] } }, { operState: 'DOWN' }] }),
    };

    const problemAssets = await prisma.asset.findMany({
      where,
      select: { location: { select: { up3: true } } },
      take: 5000, // bounded scan; aggregation done in-process
    });

    const byUp3 = new Map<string, number>();
    for (const a of problemAssets) {
      const up3 = a.location?.up3 ?? 'Tidak diketahui';
      byUp3.set(up3, (byUp3.get(up3) ?? 0) + 1);
    }

    const ranked = [...byUp3.entries()]
      .map(([up3, count]) => ({ up3, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      kind: 'insight' as const,
      basis: 'aset bermasalah (rusak/peringatan/offline) per UP3',
      total: problemAssets.length,
      ranking: ranked,
    };
  }

  // ── inspeksi.summary — equipment-condition overview from inspection data ──
  async inspectionSummary(ctx: AiContext) {
    const scope = ctx.scope;
    const rows = await prisma.inspeksiGarduRecord.findMany({
      where: { ...viaLocationScopeWhere(scope) },
      select: {
        kesimpulanRectifier: true,
        kesimpulanBaterai: true,
        kesimpulanRtu: true,
        kesimpulanMedia: true,
      },
    });

    const tally = (pick: (r: (typeof rows)[number]) => string | null) => {
      const out = { baik: 0, rusak: 0, perluPengecekan: 0, tidakAda: 0 };
      for (const r of rows) {
        const v = pick(r);
        if (v === 'BAIK') out.baik++;
        else if (v === 'RUSAK') out.rusak++;
        else if (v === 'PERLU PENGECEKAN LANJUT') out.perluPengecekan++;
        else out.tidakAda++; // null = komponen tidak tercatat/tidak ada di gardu tsb
      }
      return out;
    };

    return {
      kind: 'inspeksi-summary' as const,
      totalDataInspeksi: rows.length,
      rectifier: tally((r) => r.kesimpulanRectifier),
      baterai: tally((r) => r.kesimpulanBaterai),
      rtu: tally((r) => r.kesimpulanRtu),
      media: tally((r) => r.kesimpulanMedia),
    };
  }

  // ── inspeksi.problems — gardu with a RUSAK/PERLU PENGECEKAN LANJUT verdict ─
  async inspectionProblems(ctx: AiContext, slots: IntentSlots) {
    const scope = ctx.scope;
    const values = kesimpulanValuesFor(slots.status);

    const where: Prisma.InspeksiGarduRecordWhereInput = {
      ...viaLocationScopeWhere(scope),
      OR: INSPEKSI_KESIMPULAN_FIELDS.map((field) => ({ [field]: { in: values } })),
    };

    const [total, items] = await Promise.all([
      prisma.inspeksiGarduRecord.count({ where }),
      prisma.inspeksiGarduRecord.findMany({
        where,
        take: LIST_LIMIT,
        orderBy: { tanggalPekerjaan: 'desc' },
        select: {
          kodeGardu: true,
          up3: true,
          penyulang: true,
          tanggalPekerjaan: true,
          kesimpulanRectifier: true,
          kategoriRectifier: true,
          kesimpulanBaterai: true,
          kategoriBaterai: true,
          kesimpulanRtu: true,
          kategoriRtu: true,
          kesimpulanMedia: true,
          kategoriMedia: true,
        },
      }),
    ]);

    const komponen = (label: string, kesimpulan: string | null, kategori: string | null) =>
      kesimpulan && kesimpulan !== 'BAIK' ? `${label}: ${kesimpulan}${kategori ? ` (${kategori})` : ''}` : null;

    return {
      kind: 'inspeksi-problems' as const,
      total,
      shown: items.length,
      items: items.map((r) => ({
        kodeGardu: r.kodeGardu,
        up3: r.up3,
        penyulang: r.penyulang,
        tanggal: r.tanggalPekerjaan,
        masalah: [
          komponen('Rectifier', r.kesimpulanRectifier, r.kategoriRectifier),
          komponen('Baterai', r.kesimpulanBaterai, r.kategoriBaterai),
          komponen('RTU', r.kesimpulanRtu, r.kategoriRtu),
          komponen('Media', r.kesimpulanMedia, r.kategoriMedia),
        ].filter((x): x is string => x !== null),
      })),
    };
  }

  // ── inspeksi.brands — brand failure-rate ranking from inspection data ─────
  async inspectionBrands(ctx: AiContext) {
    const scope = ctx.scope;
    const rows = await prisma.inspeksiGarduRecord.findMany({
      where: { ...viaLocationScopeWhere(scope) },
      select: {
        merkRectifier: true,
        kesimpulanRectifier: true,
        merkBaterai: true,
        kesimpulanBaterai: true,
        merkRtu: true,
        kesimpulanRtu: true,
        merkMedia: true,
        kesimpulanMedia: true,
      },
    });

    function rank(pickMerk: (r: (typeof rows)[number]) => string | null, pickKesimpulan: (r: (typeof rows)[number]) => string | null) {
      const totalByMerk = new Map<string, number>();
      const rusakByMerk = new Map<string, number>();
      for (const r of rows) {
        const merk = pickMerk(r);
        if (!merk) continue;
        totalByMerk.set(merk, (totalByMerk.get(merk) ?? 0) + 1);
        if (pickKesimpulan(r) === 'RUSAK') rusakByMerk.set(merk, (rusakByMerk.get(merk) ?? 0) + 1);
      }
      return [...totalByMerk.entries()]
        .map(([merk, totalUnit]) => ({ merk, totalUnit, jumlahRusak: rusakByMerk.get(merk) ?? 0 }))
        .sort((a, b) => b.jumlahRusak - a.jumlahRusak)
        .slice(0, 10);
    }

    return {
      kind: 'inspeksi-brands' as const,
      rectifier: rank((r) => r.merkRectifier, (r) => r.kesimpulanRectifier),
      baterai: rank((r) => r.merkBaterai, (r) => r.kesimpulanBaterai),
      rtu: rank((r) => r.merkRtu, (r) => r.kesimpulanRtu),
      media: rank((r) => r.merkMedia, (r) => r.kesimpulanMedia),
    };
  }

  // ── har.summary — equipment-condition overview from historical HAR data ───
  // NB: HAR verdict taxonomy is BAIK | RUSAK | PERLU CEK LEBIH LANJUT (bukan
  // "PERLU PENGECEKAN LANJUT" seperti inspeksi). kesimpulanBaterai null utk
  // semua baris GARDU_MP (file sumbernya tidak punya kolom verdict baterai).
  async harSummary(ctx: AiContext) {
    const scope = ctx.scope;
    const rows = await prisma.harGarduRecord.findMany({
      where: { ...viaLocationScopeWhere(scope) },
      select: {
        kesimpulanRectifier: true,
        kesimpulanBaterai: true,
        kesimpulanRtu: true,
        kesimpulanMedia: true,
      },
    });

    const tally = (pick: (r: (typeof rows)[number]) => string | null) => {
      const out = { baik: 0, rusak: 0, perluPengecekan: 0, tidakAda: 0 };
      for (const r of rows) {
        const v = pick(r);
        if (v === 'BAIK') out.baik++;
        else if (v === 'RUSAK') out.rusak++;
        else if (v === 'PERLU CEK LEBIH LANJUT') out.perluPengecekan++;
        else out.tidakAda++; // null = komponen tidak tercatat/tidak ada verdict di sumber
      }
      return out;
    };

    return {
      kind: 'har-summary' as const,
      totalDataHar: rows.length,
      rectifier: tally((r) => r.kesimpulanRectifier),
      baterai: tally((r) => r.kesimpulanBaterai),
      rtu: tally((r) => r.kesimpulanRtu),
      media: tally((r) => r.kesimpulanMedia),
    };
  }

  // ── har.brands — brand failure-rate ranking from historical HAR data ──────
  async harBrands(ctx: AiContext) {
    const scope = ctx.scope;
    const rows = await prisma.harGarduRecord.findMany({
      where: { ...viaLocationScopeWhere(scope) },
      select: {
        merkRectifier: true,
        kesimpulanRectifier: true,
        merkBaterai: true,
        kesimpulanBaterai: true,
        merkRtu: true,
        kesimpulanRtu: true,
        merkMedia: true,
        kesimpulanMedia: true,
      },
    });

    function rank(pickMerk: (r: (typeof rows)[number]) => string | null, pickKesimpulan: (r: (typeof rows)[number]) => string | null) {
      const totalByMerk = new Map<string, number>();
      const rusakByMerk = new Map<string, number>();
      for (const r of rows) {
        const merk = pickMerk(r);
        if (!merk) continue;
        totalByMerk.set(merk, (totalByMerk.get(merk) ?? 0) + 1);
        if (pickKesimpulan(r) === 'RUSAK') rusakByMerk.set(merk, (rusakByMerk.get(merk) ?? 0) + 1);
      }
      return [...totalByMerk.entries()]
        .map(([merk, totalUnit]) => ({ merk, totalUnit, jumlahRusak: rusakByMerk.get(merk) ?? 0 }))
        .sort((a, b) => b.jumlahRusak - a.jumlahRusak)
        .slice(0, 10);
    }

    return {
      kind: 'har-brands' as const,
      rectifier: rank((r) => r.merkRectifier, (r) => r.kesimpulanRectifier),
      baterai: rank((r) => r.merkBaterai, (r) => r.kesimpulanBaterai),
      rtu: rank((r) => r.merkRtu, (r) => r.kesimpulanRtu),
      media: rank((r) => r.merkMedia, (r) => r.kesimpulanMedia),
    };
  }

  // ── inspeksi.detail — inspection history for one gardu code ───────────────
  async inspectionDetail(ctx: AiContext, slots: IntentSlots) {
    const scope = ctx.scope;
    const query = (slots.keyword ?? '').trim();
    if (!query) return { kind: 'inspeksi-detail' as const, found: false as const, query: null };

    const baseWhere = viaLocationScopeWhere(scope);
    let records = await prisma.inspeksiGarduRecord.findMany({
      where: { ...baseWhere, kodeGardu: { equals: query } },
      orderBy: { tanggalPekerjaan: 'desc' },
      take: 5,
    });
    if (records.length === 0) {
      records = await prisma.inspeksiGarduRecord.findMany({
        where: { ...baseWhere, kodeGardu: { contains: query, mode: 'insensitive' as const } },
        orderBy: { tanggalPekerjaan: 'desc' },
        take: 5,
      });
    }

    if (records.length === 0) return { kind: 'inspeksi-detail' as const, found: false as const, query };

    return {
      kind: 'inspeksi-detail' as const,
      found: true as const,
      query,
      kodeGardu: records[0].kodeGardu,
      riwayat: records.map((r) => ({
        tanggal: r.tanggalPekerjaan,
        up3: r.up3,
        rectifier: { merk: r.merkRectifier, kesimpulan: r.kesimpulanRectifier, kategori: r.kategoriRectifier },
        baterai: { merk: r.merkBaterai, kesimpulan: r.kesimpulanBaterai, kategori: r.kategoriBaterai },
        rtu: { merk: r.merkRtu, kesimpulan: r.kesimpulanRtu, kategori: r.kategoriRtu },
        media: { merk: r.merkMedia, kesimpulan: r.kesimpulanMedia, kategori: r.kategoriMedia },
        catatan: r.catatan,
      })),
    };
  }

  // ── navigate — resolve a page slug to an FE route (no DB) ─────────────────
  async navigatePage(_ctx: AiContext, slots: IntentSlots) {
    const page = slots.entity ?? null;
    const route = page ? PAGE_ROUTES[page] : undefined;
    if (!route) return { kind: 'navigate' as const, found: false as const, page };
    return { kind: 'navigate' as const, found: true as const, page, ...route };
  }
}

// Route map — canonical page slug (NAVIGATE slot `entity`) → FE path + label.
const PAGE_ROUTES: Record<string, { path: string; label: string }> = {
  'har-gh':      { path: '/har-gh',      label: 'Laporan HAR Gardu Hubung' },
  'har-mp':      { path: '/har-mp',      label: 'Laporan HAR MP' },
  'har-gi':      { path: '/har-gi',      label: 'Laporan HAR GI' },
  'inspeksi-gh': { path: '/inspeksi-gh', label: 'Laporan Inspeksi GH' },
  'inspeksi-mp': { path: '/inspeksi-mp', label: 'Inspeksi MP' },
  'work-order':  { path: '/work-order',  label: 'Work Order' },
  'dashboard':   { path: '/lapangan',    label: 'Dashboard Lapangan' },
};

export const aiQueryServices = new AiQueryServices();