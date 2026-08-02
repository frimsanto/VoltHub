// VoltHub V2 — Performance resource (API + hooks + helpers).
//
// Backend (BE/src/modules/performance) is READ-ONLY: list/get/summary for any
// authenticated role; writes flow through the Import engine (BR-010/011). We only
// consume the read endpoints here — no create/update/remove are used.
//
// Real backend fields per `performance_daily` row:
//   performanceStatus  1 = Berhasil (gardu remote-controllable that day) / 0 = Gagal
//   score              0–100 daily performance score (nullable)
// Availability% derives from performanceStatus (up/down). RC status per date is
// DEMO-derived (see lib/v2/demo-adapter.ts) until the OOP/INSCAN feed lands.
import { useQuery } from "@tanstack/react-query";
import { createResource } from "@/features/v2/createResource";
import { v2Get } from "@/lib/api/v2";
import { locationLabel } from "@/lib/utils";
import { garduRcStatus, type RcStatus } from "@/lib/v2/demo-adapter";
import type { LocationRef } from "@/features/v2/inspections/resource";

export interface PerformanceRecord {
  id: string;
  locationId: string;
  performanceDate: string;
  performanceStatus: number; // 1 = Berhasil, 0 = Gagal
  score: number | null;
  createdAt?: string;
  updatedAt?: string;
  location?: LocationRef;
}

export interface PerformanceParams extends Record<string, unknown> {
  page?: number;
  limit?: number;
  siteId?: string;
  locationId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export const performance = createResource<
  PerformanceRecord,
  PerformanceRecord,
  Record<string, never>,
  Record<string, never>,
  PerformanceParams
>({ key: "v2-performance", path: "/performance", labels: { entity: "Performa" } });

// ── Summary (GET /performance/summary) ────────────────────────────────────────
export interface PerformanceSummary {
  total: number;
  berhasil: number;
  gagal: number;
  successRate: number; // % berhasil/total
  avgScore: number | null;
}

export function usePerformanceSummary(
  params?: Pick<PerformanceParams, "siteId" | "locationId" | "dateFrom" | "dateTo">,
  opts?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ["v2-performance", "summary", params ?? {}],
    queryFn: () => v2Get<PerformanceSummary>("/performance/summary", { params }),
    enabled: opts?.enabled ?? true,
  });
}

// ── Derived helpers ───────────────────────────────────────────────────────────
/** Daily availability % from the up/down status (Berhasil = 100, Gagal = 0). */
export const availabilityPct = (r: PerformanceRecord): number =>
  r.performanceStatus === 1 ? 100 : 0;

/** Ranking score for a record: real score when present, else availability. */
export const perfScore = (r: PerformanceRecord): number => r.score ?? availabilityPct(r);

/** DEMO RC status per (gardu, date) — deterministic, reuses the app-wide mix. */
export const rcStatusForDate = (locationId: string, date: string): RcStatus =>
  garduRcStatus(`${locationId}|${date.slice(0, 10)}`);

const fmtDay = (raw: string) =>
  new Date(raw).toLocaleDateString("id-ID", { day: "2-digit", month: "short" });

/** Build oldest→newest trend points (records arrive newest-first from the API). */
export function buildPerfTrends(records: PerformanceRecord[]) {
  const ordered = [...records].sort(
    (a, b) => +new Date(a.performanceDate) - +new Date(b.performanceDate),
  );
  return ordered.map((r) => ({
    date: fmtDay(r.performanceDate),
    Skor: r.score ?? 0,
    Availability: availabilityPct(r),
  }));
}

// ── Dashboard aggregation (real performance data) ─────────────────────────────
export interface GarduPerf {
  locationId: string;
  label: string;
  avgAvailability: number;
  avgScore: number;
  days: number;
}

/** Powers the dashboard band: real availability trend + avg + best/worst gardu. */
export function usePerformanceDashboard() {
  // The list API caps `limit` at 100 (returns 422 above it). Fetch the largest
  // allowed page of the newest records for the client-side dashboard rollup.
  const listQ = performance.useList({ page: 1, limit: 100 });
  const summaryQ = usePerformanceSummary();
  const records = listQ.data?.items ?? [];

  // Availability trend: mean availability across all gardu, per day (last 14).
  const byDay = new Map<string, { sum: number; n: number }>();
  for (const r of records) {
    const day = fmtDay(r.performanceDate);
    const e = byDay.get(day) ?? { sum: 0, n: 0 };
    e.sum += availabilityPct(r);
    e.n += 1;
    byDay.set(day, e);
  }
  const trend = Array.from(byDay.entries())
    .slice(-14)
    .map(([date, { sum, n }]) => ({ date, Availability: Math.round((sum / n) * 10) / 10 }));

  // Per-gardu rollup → best/worst performing.
  const byGardu = new Map<string, { label: string; avail: number; score: number; n: number }>();
  for (const r of records) {
    const e = byGardu.get(r.locationId) ?? {
      label: r.location ? locationLabel(r.location.code, r.location.name) : r.locationId,
      avail: 0,
      score: 0,
      n: 0,
    };
    e.avail += availabilityPct(r);
    e.score += perfScore(r);
    e.n += 1;
    byGardu.set(r.locationId, e);
  }
  const gardus: GarduPerf[] = Array.from(byGardu.entries()).map(([locationId, e]) => ({
    locationId,
    label: e.label,
    avgAvailability: Math.round((e.avail / e.n) * 10) / 10,
    avgScore: Math.round((e.score / e.n) * 10) / 10,
    days: e.n,
  }));
  const ranked = [...gardus].sort((a, b) => b.avgScore - a.avgScore);

  return {
    trend,
    avgAvailability: summaryQ.data?.successRate ?? null,
    topGardu: ranked[0] ?? null,
    lowestGardu: ranked.length > 0 ? ranked[ranked.length - 1] : null,
    isLoading: listQ.isLoading || summaryQ.isLoading,
    isEmpty: !listQ.isLoading && records.length === 0,
  };
}
