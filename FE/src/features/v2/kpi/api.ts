// VoltHub — Enterprise KPI Dashboard data layer.
// One backend endpoint (`GET /api/v1/kpi/dashboard`) returns every widget in a
// single optimized round trip (BE/src/modules/kpi). The dashboard therefore
// makes ONE request instead of fanning out per card — see docs/KPI_DASHBOARD.md.
import { useQuery } from "@tanstack/react-query";
import { v2Get } from "@/lib/api/v2";

// ── Response contract (mirrors BE/src/modules/kpi/kpi.dto.ts) ──────────────────
export interface KpiSummary {
  totalPekerjaan: number;
  pekerjaanSelesai: number;
  pekerjaanBerjalan: number;
  pendingApproval: number;
  rejected: number;
  completionRate: number;
}

export interface KpiSla {
  finalized: number;
  withinSla: number;
  slaCompletionRate: number;
  avgApprovalHours: number | null;
  slaWindowHours: number;
}

export interface KpiTeamPerformance {
  teamId: string;
  teamName: string;
  teamCode: string | null;
  total: number;
  selesai: number;
  completionRate: number;
}

export interface KpiMonthlyTrendPoint {
  month: string;
  label: string;
  total: number;
  selesai: number;
}

export interface KpiTopPetugas {
  userId: string;
  name: string;
  total: number;
  selesai: number;
}

export interface KpiDashboardData {
  summary: KpiSummary;
  sla: KpiSla;
  teamPerformance: KpiTeamPerformance[];
  monthlyTrend: KpiMonthlyTrendPoint[];
  topTeam: KpiTeamPerformance | null;
  topPetugas: KpiTopPetugas[];
  scope: { level: "GLOBAL" | "RTUPP"; rtuppId: string | null };
  generatedAt: string;
}

export interface KpiParams {
  /** Months for the trend widget (default 6). */
  months?: number;
  /** SLA window in hours (default 48). */
  slaHours?: number;
  /** Top Petugas leaderboard size (default 5). */
  topLimit?: number;
}

const keys = {
  dashboard: (p?: KpiParams) => ["v2-kpi", "dashboard", p ?? {}] as const,
};

/**
 * Load the full executive/operational KPI dashboard. Cached for 60s so quick
 * navigations don't refetch; the page exposes a manual refresh.
 */
export function useKpiDashboard(params?: KpiParams) {
  return useQuery<KpiDashboardData>({
    queryKey: keys.dashboard(params),
    queryFn: () =>
      v2Get<KpiDashboardData>("/kpi/dashboard", {
        params: params as Record<string, unknown> | undefined,
      }),
    staleTime: 60_000,
  });
}
