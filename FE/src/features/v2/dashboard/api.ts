// VoltHub — Dashboard data hooks.
//
// Previously each card fetched its own tiny `limit:1` count, so one dashboard
// load fanned out ~30 requests — which tripped the API rate limit (429 storms)
// and was slow. Now a SINGLE aggregate endpoint (`GET /api/v1/dashboard/overview`,
// BE/src/modules/dashboard) returns every figure in one optimized round-trip.
// All the hooks below read from that one shared query (same queryKey ⇒ React
// Query dedupes to a single network request) and only reshape the slice each
// consumer needs, so component code is unchanged.
import { useQuery } from "@tanstack/react-query";
import { v2Get } from "@/lib/api/v2";
import { locations } from "@/features/v2/locations/resource";
import { useUsers } from "@/features/v2/admin/hooks";
import { getRekap, type RekapItem } from "@/lib/api/rekap";
import {
  ASSET_STATUSES,
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  type AssetStatus,
} from "@/lib/v2/enums";
import type { ImportStatus } from "@/features/v2/imports/resource";
import { aggregateGarduStats, topProblemGardu } from "@/lib/v2/demo-adapter";
import type { TrendPoint } from "./charts";

// ── Aggregate response contract (mirrors BE dashboard.service) ────────────────
export interface DashboardOverview {
  counts: {
    gardu: number;
    penyulang: number;
    asset: number;
    inspection: number;
    har: number;
    document: number;
    commMedia: number;
    report: number;
    ticketOpen: number;
    ticketClosed: number;
  };
  assetByStatus: Record<string, number>;
  assetByType: Record<string, number>;
  ticketByStatus: Record<string, number>;
  documentByType: Record<string, number>;
  monthly: { inspectionThisMonth: number; harThisMonth: number };
  opsTrend: { date: string; inspeksi: number; har: number }[];
  import: {
    total: number;
    byStatus: Record<string, number>;
    failed: number;
    rowsImported: number;
    recent: {
      id: string;
      fileName: string;
      status: ImportStatus;
      createdAt: string;
      successRows: number | null;
    }[];
  };
  criticalAssets: {
    total: number;
    items: {
      id: string;
      assetCode: string;
      assetName: string;
      assetType: string;
      status: AssetStatus;
      locationId: string;
      locationName: string | null;
    }[];
  };
  recentInspections: {
    id: string;
    inspectionDate: string;
    locationId: string;
    locationCode: string | null;
    findings: number;
  }[];
  recentHar: {
    id: string;
    reportDate: string;
    locationId: string;
    locationCode: string | null;
    details: number;
  }[];
  generatedAt: string;
}

/** The single source query every dashboard card derives from. */
export function useDashboardOverview() {
  return useQuery<DashboardOverview>({
    queryKey: ["v2-dashboard-overview"],
    queryFn: () => v2Get<DashboardOverview>("/dashboard/overview"),
    staleTime: 60_000,
  });
}

// ── Live SCADA RTU state (control-room / monitoring wall) ─────────────────────
// Fed by the periodic IFS RTU-state import (BE: GET /assets/scada/summary). This
// is genuine live state, so it polls on an interval and never goes stale.
export interface ScadaRtuSummary {
  total: number;
  up: number;
  down: number;
  unknown: number;
  availability: number | null;
}

/** Real-time RTU UP/DOWN snapshot. `refetchInterval` ms (default 15s). */
export function useScadaRtuSummary(refetchInterval = 15_000) {
  return useQuery<ScadaRtuSummary>({
    queryKey: ["v2-scada-rtu-summary"],
    queryFn: () => v2Get<ScadaRtuSummary>("/assets/scada/summary"),
    refetchInterval,
    staleTime: 0,
  });
}

// ── Derived hooks (all read the one shared query) ─────────────────────────────

/** Top-level entity totals. */
export function useEntityCounts() {
  const { data, isLoading } = useDashboardOverview();
  const c = data?.counts;
  return {
    assets: c?.asset,
    inspections: c?.inspection,
    har: c?.har,
    documents: c?.document,
    commMedia: c?.commMedia,
    locations: c?.gardu,
    reports: c?.report,
    isLoading,
  };
}

/** Asset status breakdown for the donut (ACTIVE/WARNING/DAMAGED/RETIRED). */
export function useAssetStatusBreakdown() {
  const { data, isLoading } = useDashboardOverview();
  return {
    data: ASSET_STATUSES.map((s) => ({ name: s, value: data?.assetByStatus[s] ?? 0 })),
    isLoading,
  };
}

/** Device-category counts (RTU / Rectifier / Battery / Comm Media). */
export function useDeviceTypeCounts() {
  const { data, isLoading } = useDashboardOverview();
  return {
    rtu: data?.assetByType.RTU ?? 0,
    rectifier: data?.assetByType.RECTIFIER ?? 0,
    battery: data?.assetByType.BATTERY_BANK ?? 0,
    commMedia: data?.counts.commMedia ?? 0,
    isLoading,
  };
}

/** Critical assets = WARNING ∪ DAMAGED (server-aggregated, top 25). */
export function useCriticalAssets() {
  const { data, isLoading } = useDashboardOverview();
  return {
    items: data?.criticalAssets.items ?? [],
    total: data?.criticalAssets.total ?? 0,
    isLoading,
  };
}

/** Import statistics: total + per-status + recent rows + highlights. */
export function useImportStats() {
  const { data, isLoading } = useDashboardOverview();
  const imp = data?.import;
  const byStatus = ["SUCCESS", "PROCESSING", "PENDING", "FAILED"].map((s) => ({
    name: s,
    value: imp?.byStatus[s] ?? 0,
  }));
  return {
    total: imp?.total ?? 0,
    byStatus,
    recent: imp?.recent ?? [],
    rowsImported: imp?.rowsImported ?? 0,
    lastImport: imp?.recent?.[0],
    failedCount: imp?.failed ?? 0,
    isLoading,
  };
}

/** Document type breakdown (bar). */
export function useDocumentTypeBreakdown() {
  const { data, isLoading } = useDashboardOverview();
  return {
    data: DOCUMENT_TYPES.map((t) => ({
      name: DOCUMENT_TYPE_LABELS[t],
      value: data?.documentByType[t] ?? 0,
    })),
    isLoading,
  };
}

/** Inspection + HAR recent rows and their 14-day trend. */
export function useOperationsTrend() {
  const { data, isLoading } = useDashboardOverview();
  const inspTrend: TrendPoint[] = (data?.opsTrend ?? []).map((p) => ({
    date: p.date,
    Inspeksi: p.inspeksi,
  }));
  const harTrend: TrendPoint[] = (data?.opsTrend ?? []).map((p) => ({ date: p.date, HAR: p.har }));
  // Reshape to the {location:{code}, _count:{...}} shape the RecentList renders expect.
  const recentInspections = (data?.recentInspections ?? []).map((i) => ({
    id: i.id,
    inspectionDate: i.inspectionDate,
    locationId: i.locationId,
    location: { code: i.locationCode },
    _count: { findings: i.findings },
  }));
  const recentHar = (data?.recentHar ?? []).map((h) => ({
    id: h.id,
    reportDate: h.reportDate,
    locationId: h.locationId,
    location: { code: h.locationCode },
    _count: { details: h.details },
  }));
  return { recentInspections, recentHar, inspTrend, harTrend, isLoading };
}

/** Ticket counts — Open vs Closed (server-aggregated). */
export function useTicketCounts() {
  const { data, isLoading } = useDashboardOverview();
  return {
    open: data?.counts.ticketOpen ?? 0,
    closed: data?.counts.ticketClosed ?? 0,
    isLoading,
  };
}

/** Total users (V1 admin endpoint) — SUPERADMIN only. */
export function useUserCount() {
  const q = useUsers();
  return { total: q.data?.length, isLoading: q.isLoading };
}

// ── Management overview (VoltHub demo dashboard) ──────────────────────────────
// Real counts come from the aggregate endpoint. RC Inscan/OOP are real too:
// GET /assets/scada/summary counts the individual rows of the latest SP7 RTU
// snapshot (same universe as /scada-realtime). Only the remaining ticket
// fallback and Top Problem Gardu still derive from the client-side locations
// sample via lib/v2/demo-adapter.
export function useGarduOverview() {
  const overview = useDashboardOverview();
  const garduSample = locations.useList({ page: 1, limit: 100 });
  const scada = useScadaRtuSummary(60_000);

  const c = overview.data?.counts;
  const items = garduSample.data?.items ?? [];
  const totalGardu = c?.gardu ?? garduSample.data?.meta.total ?? items.length;
  const stats = aggregateGarduStats(items);
  const scale = items.length > 0 ? totalGardu / items.length : 1;
  const scaled = (n: number) => Math.round(n * scale);

  return {
    totalGardu,
    totalPenyulang: c?.penyulang,
    totalAsset: c?.asset,
    rcInscan: scada.data?.up,
    rcOop: scada.data?.down,
    openTickets: c?.ticketOpen ?? scaled(stats.openTickets),
    problems: topProblemGardu(items, 6),
    sampleSeed: String(totalGardu),
    isLoading: overview.isLoading || garduSample.isLoading || scada.isLoading,
  };
}

// ── Report rollups (real, from the Rekap Laporan Awal endpoint) ───────────────
// `/rekap` (BE requireMonitor: MASTER/MANAGER/ADMIN) returns Laporan Awal rows
// carrying the authoring RTUPP and the free-text UP3 region. We pull one large
// page and roll the rows up by RTUPP / UP3 on the client — these dimensions have
// no dedicated aggregate endpoint, so this is the real source for the management
// "Top RTUPP / Top UP3 / Wilayah Bermasalah" widgets. No invented numbers: a
// region only appears if it exists on a real report.
export interface ReportRollup {
  key: string;
  total: number;
  approved: number;
  rejected: number;
}

const rankRollup = (m: Map<string, ReportRollup>): ReportRollup[] =>
  Array.from(m.values()).sort((a, b) => b.total - a.total);

function rollupBy(rows: RekapItem[], pick: (r: RekapItem) => string | null | undefined) {
  const m = new Map<string, ReportRollup>();
  for (const r of rows) {
    const raw = pick(r);
    const key = (raw ?? "").trim();
    if (!key) continue;
    const e = m.get(key) ?? { key, total: 0, approved: 0, rejected: 0 };
    e.total += 1;
    if (r.status === "APPROVED") e.approved += 1;
    if (r.status === "REJECTED") e.rejected += 1;
    m.set(key, e);
  }
  return m;
}

/**
 * Roll a real sample of Laporan Awal up by RTUPP and by UP3. Used by the MANAGER
 * (regional comparison) and MASTER (UP3 coverage) dashboards. Cached for 60s.
 */
export function useReportRollups(limit = 500) {
  const q = useQuery({
    queryKey: ["v2-report-rollups", limit],
    queryFn: () => getRekap({ page: 1, limit }),
    staleTime: 60_000,
  });
  const rows = q.data?.items ?? [];
  const byRtupp = rollupBy(rows, (r) => r.createdBy?.rtupp?.name);
  const byUp3 = rollupBy(rows, (r) => r.up3);
  const topRtupp = rankRollup(byRtupp);
  const topUp3 = rankRollup(byUp3);
  // "Problem" regions = those with the most rejected reports (then most total).
  const problemAreas = [...byUp3.values()]
    .filter((e) => e.rejected > 0)
    .sort((a, b) => b.rejected - a.rejected || b.total - a.total);
  return {
    topRtupp,
    topUp3,
    problemAreas,
    distinctRtupp: byRtupp.size,
    distinctUp3: byUp3.size,
    sampleSize: rows.length,
    total: q.data?.pagination?.total ?? rows.length,
    isLoading: q.isLoading,
  };
}

// ── Team leaderboard (monthly activity ranking within one RTUPP) ──────────────
// BE computes score/rank/badges server-side (dashboard/leaderboard.service);
// the FE only renders. PETUGAS is pinned to their own RTUPP by the BE.
export interface LeaderboardEntry {
  teamId: string;
  teamName: string;
  teamCode: string;
  leaderName: string | null;
  score: number;
  rank: number;
  woCompleted: number;
  inspeksiCount: number;
  harCount: number;
  laporanApproved: number;
  badges: string[];
}

export interface LeaderboardResponse {
  rtuppId: string;
  month: string; // "YYYY-MM"
  teams: LeaderboardEntry[];
  generatedAt: string;
}

/** Monthly team leaderboard. Omit `rtuppId` to use the caller's own RTUPP. */
export function useLeaderboard(rtuppId?: string, month?: string) {
  const params = new URLSearchParams();
  if (rtuppId) params.set("rtuppId", rtuppId);
  if (month) params.set("month", month);
  const qs = params.toString();
  return useQuery<LeaderboardResponse>({
    queryKey: ["v2-leaderboard", rtuppId, month],
    queryFn: () => v2Get<LeaderboardResponse>(`/dashboard/leaderboard${qs ? `?${qs}` : ""}`),
    staleTime: 60_000,
  });
}

/** Inspections + HAR dated within the current calendar month (server-aggregated). */
export function useMonthlyOps() {
  const { data, isLoading } = useDashboardOverview();
  return {
    inspectionThisMonth: data?.monthly.inspectionThisMonth ?? 0,
    harThisMonth: data?.monthly.harThisMonth ?? 0,
    isLoading,
  };
}
