import { kpiRepository, KpiRepository } from './kpi.repository';
import { ForbiddenError } from '../../utils/appError';
import { hasGlobalScope, isMaster } from '../../auth/roles';
import type { KpiQuery } from './kpi.validation';
import type {
  KpiDashboard,
  KpiMonthlyTrendPoint,
  KpiSla,
  KpiSummary,
  KpiTeamPerformance,
} from './kpi.dto';

/** Round to 1 decimal place (rates/percentages). */
const pct = (numer: number, denom: number): number =>
  denom > 0 ? Math.round((numer / denom) * 1000) / 10 : 0;

const round1 = (n: number): number => Math.round(n * 10) / 10;

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
];

/** Build the continuous list of the last `months` YYYY-MM keys (oldest→newest). */
const monthWindow = (months: number): { key: string; label: string; start: Date }[] => {
  const out: { key: string; label: string; start: Date }[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push({ key, label: `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`, start: d });
  }
  return out;
};

/**
 * KPI Service — assembles the executive/operational dashboard from the
 * pre-aggregated repository rows. It owns: data-scope resolution (RBAC), rate
 * math, and zero-filling the trend so the chart is continuous. Every widget for
 * a dashboard request is fetched with a single `Promise.all` (no duplicate
 * queries, no sequential waterfalls) — see docs/KPI_DASHBOARD.md.
 */
export class KpiService {
  constructor(private readonly repo: KpiRepository = kpiRepository) {}

  /**
   * Resolve the data scope for the requester.
   *   MASTER                → GLOBAL (system-owner audit read)
   *   ADMIN                 → GLOBAL (2026-07 policy: data access lintas RTUPP)
   *   MANAGER (rtuppId ∅)   → GLOBAL (Manager UP3, read-only monitoring)
   *   MANAGER (rtuppId set) → ASMEN: only their own RTUPP
   */
  private async resolveScope(
    userId: string,
    role?: string | null
  ): Promise<{ level: 'GLOBAL' | 'RTUPP'; rtuppId: string | null }> {
    if (isMaster(role)) return { level: 'GLOBAL', rtuppId: null };
    const rtuppId = await this.repo.getUserRtuppId(userId);
    if (hasGlobalScope(role, rtuppId)) return { level: 'GLOBAL', rtuppId: null };
    if (!rtuppId) {
      throw new ForbiddenError('Akun Anda belum terhubung ke RTUPP untuk melihat KPI');
    }
    return { level: 'RTUPP', rtuppId };
  }

  private buildSummary(s: {
    total: number;
    selesai: number;
    pending: number;
    rejected: number;
    berjalan: number;
  }): KpiSummary {
    return {
      totalPekerjaan: s.total,
      pekerjaanSelesai: s.selesai,
      pekerjaanBerjalan: s.berjalan,
      pendingApproval: s.pending,
      rejected: s.rejected,
      completionRate: pct(s.selesai, s.total),
    };
  }

  private buildSla(
    s: { finalized: number; withinSla: number; avgHours: number | null },
    slaHours: number
  ): KpiSla {
    return {
      finalized: s.finalized,
      withinSla: s.withinSla,
      slaCompletionRate: pct(s.withinSla, s.finalized),
      avgApprovalHours: s.avgHours == null ? null : round1(s.avgHours),
      slaWindowHours: slaHours,
    };
  }

  private buildTeams(
    rows: { teamId: string; teamName: string; teamCode: string | null; total: number; selesai: number }[]
  ): KpiTeamPerformance[] {
    return rows.map((r) => ({
      teamId: r.teamId,
      teamName: r.teamName,
      teamCode: r.teamCode,
      total: r.total,
      selesai: r.selesai,
      completionRate: pct(r.selesai, r.total),
    }));
  }

  /** Zero-fill the monthly trend so every month in the window is present. */
  private buildTrend(
    rows: { month: string; total: number; selesai: number }[],
    months: number
  ): KpiMonthlyTrendPoint[] {
    const byMonth = new Map(rows.map((r) => [r.month, r]));
    return monthWindow(months).map((w) => {
      const hit = byMonth.get(w.key);
      return { month: w.key, label: w.label, total: hit?.total ?? 0, selesai: hit?.selesai ?? 0 };
    });
  }

  async getSummary(userId: string, role: string | null | undefined, query: KpiQuery): Promise<KpiSummary> {
    const { rtuppId } = await this.resolveScope(userId, role);
    return this.buildSummary(await this.repo.getStatusSummary(rtuppId));
  }

  async getSla(userId: string, role: string | null | undefined, query: KpiQuery): Promise<KpiSla> {
    const { rtuppId } = await this.resolveScope(userId, role);
    return this.buildSla(await this.repo.getSla(rtuppId, query.slaHours), query.slaHours);
  }

  async getTeamPerformance(
    userId: string,
    role: string | null | undefined
  ): Promise<KpiTeamPerformance[]> {
    const { rtuppId } = await this.resolveScope(userId, role);
    return this.buildTeams(await this.repo.getTeamPerformance(rtuppId));
  }

  async getMonthlyTrend(
    userId: string,
    role: string | null | undefined,
    query: KpiQuery
  ): Promise<KpiMonthlyTrendPoint[]> {
    const { rtuppId } = await this.resolveScope(userId, role);
    const since = monthWindow(query.months)[0].start;
    return this.buildTrend(await this.repo.getMonthlyTrend(rtuppId, since), query.months);
  }

  /** Full dashboard in one round trip — every widget fetched concurrently. */
  async getDashboard(
    userId: string,
    role: string | null | undefined,
    query: KpiQuery
  ): Promise<KpiDashboard> {
    const scope = await this.resolveScope(userId, role);
    const { rtuppId } = scope;
    const since = monthWindow(query.months)[0].start;

    const [status, sla, teamRows, trendRows, topPetugas] = await Promise.all([
      this.repo.getStatusSummary(rtuppId),
      this.repo.getSla(rtuppId, query.slaHours),
      this.repo.getTeamPerformance(rtuppId),
      this.repo.getMonthlyTrend(rtuppId, since),
      this.repo.getTopPetugas(rtuppId, query.topLimit),
    ]);

    const teamPerformance = this.buildTeams(teamRows);
    return {
      summary: this.buildSummary(status),
      sla: this.buildSla(sla, query.slaHours),
      teamPerformance,
      monthlyTrend: this.buildTrend(trendRows, query.months),
      topTeam: teamPerformance[0] ?? null,
      topPetugas,
      scope,
      generatedAt: new Date().toISOString(),
    };
  }
}

export const kpiService = new KpiService();
