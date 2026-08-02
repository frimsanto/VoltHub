import { Prisma } from '@prisma/client';
import prisma from '../../config/database';

/**
 * KPI Repository — the ONLY layer touching Prisma for the dashboard.
 *
 * Performance contract (see docs/KPI_DASHBOARD.md):
 *  - One aggregation query per widget (no per-row or N+1 fan-out).
 *  - Both report tables are combined with `UNION ALL` inside a single subquery so
 *    a "Pekerjaan" spanning laporan_awal + laporan_akhir is counted in one pass.
 *  - All counting/grouping runs in PostgreSQL (COUNT / FILTER / TO_CHAR) — the
 *    service only assembles already-aggregated rows.
 *  - Data scope (GLOBAL vs a single RTUPP) is injected as a parameterized SQL
 *    fragment, so an ADMIN's dashboard reads only its own RTUPP's reports.
 *
 * PostgreSQL note: identifiers are folded to lower case unless double-quoted,
 * so every camelCase column AND output alias below is quoted verbatim.
 */

/** RTUPP scope filter for a subquery aliasing `users` as `u`. */
const rtuppFilter = (rtuppId: string | null): Prisma.Sql =>
  rtuppId ? Prisma.sql`AND u."rtuppId" = ${rtuppId}` : Prisma.empty;

/** Coerce a SQL aggregate (BigInt / Decimal / string / null) to a number. */
const num = (v: unknown): number => {
  if (v == null) return 0;
  const n = Number(typeof v === 'bigint' ? v.toString() : String(v));
  return Number.isFinite(n) ? n : 0;
};

interface SummaryRow {
  total: unknown;
  selesai: unknown;
  pending: unknown;
  rejected: unknown;
  berjalan: unknown;
}
interface SlaRow {
  finalized: unknown;
  withinSla: unknown;
  avgHours: unknown;
}
interface TrendRow {
  month: string;
  total: unknown;
  selesai: unknown;
}
interface TeamRow {
  teamId: string;
  teamName: string;
  teamCode: string | null;
  total: unknown;
  selesai: unknown;
}
interface PetugasRow {
  userId: string;
  name: string;
  total: unknown;
  selesai: unknown;
}

export class KpiRepository {
  /** Widgets 1–5: status counts across both report tables. */
  async getStatusSummary(rtuppId: string | null) {
    const scope = rtuppFilter(rtuppId);
    const rows = await prisma.$queryRaw<SummaryRow[]>`
      SELECT
        COUNT(*)                                                            AS total,
        COUNT(*) FILTER (WHERE x.status = 'APPROVED')                       AS selesai,
        COUNT(*) FILTER (WHERE x.status = 'PENDING')                        AS pending,
        COUNT(*) FILTER (WHERE x.status = 'REJECTED')                       AS rejected,
        COUNT(*) FILTER (WHERE x.status IN ('DRAFT', 'PENDING', 'REVISED')) AS berjalan
      FROM (
        SELECT la.status AS status
          FROM laporan_awal la JOIN users u ON la."createdById" = u.id
          WHERE 1 = 1 ${scope}
        UNION ALL
        SELECT lk.status AS status
          FROM laporan_akhir lk JOIN users u ON lk."createdById" = u.id
          WHERE 1 = 1 ${scope}
      ) x
    `;
    const r = rows[0] ?? ({} as SummaryRow);
    return {
      total: num(r.total),
      selesai: num(r.selesai),
      pending: num(r.pending),
      rejected: num(r.rejected),
      berjalan: num(r.berjalan),
    };
  }

  /** Widget 10: approval-turnaround SLA over approved jobs. */
  async getSla(rtuppId: string | null, slaHours: number) {
    const scope = rtuppFilter(rtuppId);
    const rows = await prisma.$queryRaw<SlaRow[]>`
      SELECT
        COUNT(*)                                       AS finalized,
        COUNT(*) FILTER (WHERE x.hours <= ${slaHours}) AS "withinSla",
        AVG(x.hours)                                   AS "avgHours"
      FROM (
        SELECT FLOOR(EXTRACT(EPOCH FROM (la."approvedAt" - la."submittedAt")) / 3600) AS hours
          FROM laporan_awal la JOIN users u ON la."createdById" = u.id
          WHERE la.status = 'APPROVED' AND la."submittedAt" IS NOT NULL
            AND la."approvedAt" IS NOT NULL ${scope}
        UNION ALL
        SELECT FLOOR(EXTRACT(EPOCH FROM (lk."approvedAt" - lk."submittedAt")) / 3600) AS hours
          FROM laporan_akhir lk JOIN users u ON lk."createdById" = u.id
          WHERE lk.status = 'APPROVED' AND lk."submittedAt" IS NOT NULL
            AND lk."approvedAt" IS NOT NULL ${scope}
      ) x
    `;
    const r = rows[0] ?? ({} as SlaRow);
    return {
      finalized: num(r.finalized),
      withinSla: num(r.withinSla),
      avgHours: r.avgHours == null ? null : num(r.avgHours),
    };
  }

  /** Widget 7: monthly job counts since `since` (one row per YYYY-MM present). */
  async getMonthlyTrend(rtuppId: string | null, since: Date) {
    const scope = rtuppFilter(rtuppId);
    const rows = await prisma.$queryRaw<TrendRow[]>`
      SELECT x.ym AS month, SUM(x.total) AS total, SUM(x.selesai) AS selesai
      FROM (
        SELECT TO_CHAR(la."createdAt", 'YYYY-MM') AS ym, COUNT(*) AS total,
               COUNT(*) FILTER (WHERE la.status = 'APPROVED') AS selesai
          FROM laporan_awal la JOIN users u ON la."createdById" = u.id
          WHERE la."createdAt" >= ${since} ${scope}
          GROUP BY ym
        UNION ALL
        SELECT TO_CHAR(lk."createdAt", 'YYYY-MM') AS ym, COUNT(*) AS total,
               COUNT(*) FILTER (WHERE lk.status = 'APPROVED') AS selesai
          FROM laporan_akhir lk JOIN users u ON lk."createdById" = u.id
          WHERE lk."createdAt" >= ${since} ${scope}
          GROUP BY ym
      ) x
      GROUP BY x.ym
      ORDER BY x.ym ASC
    `;
    return rows.map((r) => ({ month: r.month, total: num(r.total), selesai: num(r.selesai) }));
  }

  /** Widgets 6 & 8: per-team totals (Top Team = first row, ordered by selesai). */
  async getTeamPerformance(rtuppId: string | null) {
    const scope = rtuppFilter(rtuppId);
    const rows = await prisma.$queryRaw<TeamRow[]>`
      SELECT tm.id AS "teamId", tm.name AS "teamName", tm.code AS "teamCode",
             SUM(x.total) AS total, SUM(x.selesai) AS selesai
      FROM (
        SELECT u."teamId" AS "teamId", COUNT(*) AS total,
               COUNT(*) FILTER (WHERE la.status = 'APPROVED') AS selesai
          FROM laporan_awal la JOIN users u ON la."createdById" = u.id
          WHERE u."teamId" IS NOT NULL ${scope}
          GROUP BY u."teamId"
        UNION ALL
        SELECT u."teamId" AS "teamId", COUNT(*) AS total,
               COUNT(*) FILTER (WHERE lk.status = 'APPROVED') AS selesai
          FROM laporan_akhir lk JOIN users u ON lk."createdById" = u.id
          WHERE u."teamId" IS NOT NULL ${scope}
          GROUP BY u."teamId"
      ) x
      JOIN teams tm ON tm.id = x."teamId"
      GROUP BY tm.id, tm.name, tm.code
      ORDER BY selesai DESC, total DESC
    `;
    return rows.map((r) => ({
      teamId: r.teamId,
      teamName: r.teamName,
      teamCode: r.teamCode,
      total: num(r.total),
      selesai: num(r.selesai),
    }));
  }

  /** Widget 9: top field officers (PETUGAS) by reports authored. */
  async getTopPetugas(rtuppId: string | null, limit: number) {
    const scope = rtuppFilter(rtuppId);
    const rows = await prisma.$queryRaw<PetugasRow[]>`
      SELECT u.id AS "userId", u.name AS name, SUM(x.total) AS total, SUM(x.selesai) AS selesai
      FROM (
        SELECT la."createdById" AS uid, COUNT(*) AS total,
               COUNT(*) FILTER (WHERE la.status = 'APPROVED') AS selesai
          FROM laporan_awal la GROUP BY la."createdById"
        UNION ALL
        SELECT lk."createdById" AS uid, COUNT(*) AS total,
               COUNT(*) FILTER (WHERE lk.status = 'APPROVED') AS selesai
          FROM laporan_akhir lk GROUP BY lk."createdById"
      ) x
      JOIN users u ON u.id = x.uid
      WHERE u.role = 'PETUGAS' ${scope}
      GROUP BY u.id, u.name
      ORDER BY total DESC, selesai DESC
      LIMIT ${limit}
    `;
    return rows.map((r) => ({
      userId: r.userId,
      name: r.name,
      total: num(r.total),
      selesai: num(r.selesai),
    }));
  }

  /** Resolve the RTUPP an ADMIN belongs to (for scope enforcement). */
  async getUserRtuppId(userId: string): Promise<string | null> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { rtuppId: true } });
    return user?.rtuppId ?? null;
  }
}

export const kpiRepository = new KpiRepository();
