/**
 * KPI Dashboard DTOs — Enterprise executive & operational KPI dashboard.
 *
 * "Pekerjaan" (work job) is a field report. A job is represented across the two
 * existing report tables — `laporan_awal` (work start / JSA) and `laporan_akhir`
 * (work completion) — so every KPI here aggregates BOTH tables and keys status
 * off the shared canonical `ReportStatus` enum (DRAFT / PENDING / APPROVED /
 * REJECTED / REVISED). No new tables, no mock data.
 *
 * These interfaces are the response contract consumed by the frontend
 * (FE/src/features/v2/kpi). They are intentionally serialization-safe (plain
 * numbers/strings only — the repository converts MySQL BigInt aggregates).
 */

/** The five scalar headline widgets + SLA, derived from report status. */
export interface KpiSummary {
  /** Widget 1 — Total Pekerjaan: every report in scope (awal + akhir). */
  totalPekerjaan: number;
  /** Widget 2 — Pekerjaan Selesai: status = APPROVED. */
  pekerjaanSelesai: number;
  /** Widget 3 — Pekerjaan Berjalan: status in (DRAFT, PENDING, REVISED). */
  pekerjaanBerjalan: number;
  /** Widget 4 — Pending Approval: status = PENDING. */
  pendingApproval: number;
  /** Widget 5 — Rejected: status = REJECTED. */
  rejected: number;
  /** Completion ratio (selesai / total), 0–100, rounded to 1 decimal. */
  completionRate: number;
}

/** Widget 10 — SLA Completion Rate (approval turnaround). */
export interface KpiSla {
  /** Finalized (approved) jobs that have both submittedAt and approvedAt. */
  finalized: number;
  /** Finalized jobs approved within the SLA window. */
  withinSla: number;
  /** withinSla / finalized as a percentage (0–100, 1 decimal). */
  slaCompletionRate: number;
  /** Mean approval turnaround in hours (1 decimal); null when no data. */
  avgApprovalHours: number | null;
  /** The SLA window applied, in hours (for display). */
  slaWindowHours: number;
}

/** Widget 6 — Team Performance: one row per team with active reporting. */
export interface KpiTeamPerformance {
  teamId: string;
  teamName: string;
  teamCode: string | null;
  total: number;
  selesai: number;
  completionRate: number;
}

/** Widget 7 — Monthly Trend: one point per calendar month (YYYY-MM). */
export interface KpiMonthlyTrendPoint {
  /** Machine month key, e.g. "2026-06". */
  month: string;
  /** Human label, e.g. "Jun 2026". */
  label: string;
  total: number;
  selesai: number;
}

/** Widget 9 — Top Petugas: a field officer leaderboard row. */
export interface KpiTopPetugas {
  userId: string;
  name: string;
  total: number;
  selesai: number;
}

/** The full dashboard payload — one round trip, optimized for load speed. */
export interface KpiDashboard {
  summary: KpiSummary;
  sla: KpiSla;
  teamPerformance: KpiTeamPerformance[];
  monthlyTrend: KpiMonthlyTrendPoint[];
  /** Widget 8 — Top Team: highest completed count (first of teamPerformance). */
  topTeam: KpiTeamPerformance | null;
  topPetugas: KpiTopPetugas[];
  /** Echoes the data scope applied so the UI can label it. */
  scope: { level: 'GLOBAL' | 'RTUPP'; rtuppId: string | null };
  /** Server timestamp the snapshot was computed (ISO 8601). */
  generatedAt: string;
}
