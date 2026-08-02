/**
 * PHASE 8 — Allowed Query Registry + AI RBAC Filter.
 *
 * RULE #1: the AI never generates SQL, never touches the DB directly. It may
 * ONLY invoke a query that is *declared here*. Each entry binds a stable
 * `queryId` to (a) the roles allowed to run it and (b) a handler that calls the
 * existing VoltHub service layer with the caller's already-resolved TenantScope.
 *
 * RULE #2: every handler receives the AiContext (role + scope) and MUST pass the
 * scope down to the service so tenant isolation is enforced by the same code the
 * rest of the app uses. The registry is the single choke point — if a queryId is
 * not here, the Brain cannot run it, full stop.
 */

import type { CanonicalRole } from '../../../../auth/roles';
import type { AiContext, IntentSlots } from '../brain.types';
import { aiQueryServices } from '../query/query-services';

export interface RegisteredQuery {
  id: string;
  description: string;
  allowedRoles: CanonicalRole[];
  /** Execute against the service layer with the caller's scope. */
  run: (ctx: AiContext, slots: IntentSlots) => Promise<unknown>;
}

export const QUERY_REGISTRY: Record<string, RegisteredQuery> = {
  navigate: {
    id: 'navigate',
    description: 'Navigasi ke halaman aplikasi (resolusi route saja — tidak menyentuh DB).',
    allowedRoles: ['MASTER', 'MANAGER', 'ADMIN', 'PETUGAS', 'NOC'],
    run: (ctx, slots) => aiQueryServices.navigatePage(ctx, slots),
  },
  'assets.search': {
    id: 'assets.search',
    description: 'Cari aset menurut status/jenis dalam scope pemanggil.',
    allowedRoles: ['MASTER', 'MANAGER', 'ADMIN', 'PETUGAS'],
    run: (ctx, slots) => aiQueryServices.searchAssets(ctx, slots),
  },
  'reports.search': {
    id: 'reports.search',
    description: 'Cari laporan menurut status/waktu dalam scope pemanggil.',
    allowedRoles: ['MASTER', 'MANAGER', 'ADMIN', 'PETUGAS'],
    run: (ctx, slots) => aiQueryServices.searchReports(ctx, slots),
  },
  'kpi.count': {
    id: 'kpi.count',
    description: 'Hitung entitas (gardu/aset/laporan/tiket/user) dalam scope.',
    // NOC ikut diizinkan agar intent KPI_SCADA (status Inscan/OOP dari snapshot
    // SP7 — data yang NOC sendiri unggah) bisa dieksekusi; hasilnya agregat saja.
    allowedRoles: ['MASTER', 'MANAGER', 'ADMIN', 'PETUGAS', 'NOC'],
    run: (ctx, slots) => aiQueryServices.count(ctx, slots),
  },
  'gis.search': {
    id: 'gis.search',
    description: 'Cari gardu/aset menurut wilayah (place) dalam scope.',
    allowedRoles: ['MASTER', 'MANAGER', 'ADMIN', 'PETUGAS'],
    run: (ctx, slots) => aiQueryServices.searchByPlace(ctx, slots),
  },
  'gis.detail': {
    id: 'gis.detail',
    description: 'Detail satu gardu (nama/UP3/RTUPP/alamat/koordinat) dalam scope pemanggil.',
    allowedRoles: ['MASTER', 'MANAGER', 'ADMIN', 'PETUGAS'],
    run: (ctx, slots) => aiQueryServices.locationDetail(ctx, slots),
  },
  'insight.top': {
    id: 'insight.top',
    description: 'Insight agregat: wilayah/gardu dengan masalah terbanyak.',
    // Field officers do not get cross-site insight — only managerial tiers.
    allowedRoles: ['MASTER', 'MANAGER', 'ADMIN'],
    run: (ctx, slots) => aiQueryServices.topProblematic(ctx, slots),
  },
  'inspeksi.summary': {
    id: 'inspeksi.summary',
    description: 'Ringkasan kondisi peralatan (rectifier/baterai/RTU/media) dari data historis inspeksi lapangan.',
    allowedRoles: ['MASTER', 'MANAGER', 'ADMIN', 'PETUGAS'],
    run: (ctx) => aiQueryServices.inspectionSummary(ctx),
  },
  'inspeksi.problems': {
    id: 'inspeksi.problems',
    description: 'Daftar gardu dengan hasil inspeksi RUSAK/PERLU PENGECEKAN LANJUT dalam scope pemanggil.',
    allowedRoles: ['MASTER', 'MANAGER', 'ADMIN', 'PETUGAS'],
    run: (ctx, slots) => aiQueryServices.inspectionProblems(ctx, slots),
  },
  'inspeksi.brands': {
    id: 'inspeksi.brands',
    description: 'Peringkat merk peralatan menurut tingkat kerusakan dari data historis inspeksi.',
    // Cross-site brand analysis — managerial tiers only, same gate as insight.top.
    allowedRoles: ['MASTER', 'MANAGER', 'ADMIN'],
    run: (ctx) => aiQueryServices.inspectionBrands(ctx),
  },
  'inspeksi.detail': {
    id: 'inspeksi.detail',
    description: 'Riwayat hasil inspeksi peralatan untuk satu kode gardu.',
    allowedRoles: ['MASTER', 'MANAGER', 'ADMIN', 'PETUGAS'],
    run: (ctx, slots) => aiQueryServices.inspectionDetail(ctx, slots),
  },
  'har.summary': {
    id: 'har.summary',
    description: 'Ringkasan kondisi peralatan (rectifier/baterai/RTU/media) dari data historis HAR/pemeliharaan lapangan.',
    allowedRoles: ['MASTER', 'MANAGER', 'ADMIN', 'PETUGAS'],
    run: (ctx) => aiQueryServices.harSummary(ctx),
  },
  'har.brands': {
    id: 'har.brands',
    description: 'Peringkat merk peralatan menurut tingkat kerusakan dari data historis HAR/pemeliharaan.',
    // Cross-site brand analysis — managerial tiers only, same gate as inspeksi.brands.
    allowedRoles: ['MASTER', 'MANAGER', 'ADMIN'],
    run: (ctx) => aiQueryServices.harBrands(ctx),
  },
};

export interface AuthorizeResult {
  ok: boolean;
  query?: RegisteredQuery;
  reason?: 'unknown-query' | 'role-denied';
}

/**
 * AI RBAC Filter — resolve a queryId and verify the caller's role may run it.
 * Fail-closed: an unregistered id or an out-of-role caller is denied.
 */
export function authorizeQuery(queryId: string | null | undefined, role: CanonicalRole): AuthorizeResult {
  if (!queryId) return { ok: false, reason: 'unknown-query' };
  const query = QUERY_REGISTRY[queryId];
  if (!query) return { ok: false, reason: 'unknown-query' };
  if (!query.allowedRoles.includes(role)) return { ok: false, reason: 'role-denied' };
  return { ok: true, query };
}