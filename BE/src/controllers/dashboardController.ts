import { Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { successResponse } from '../utils/response';
import { errorResponse } from '../utils/response';
import { AuthRequest } from '../middlewares/auth';
import { isFieldOfficer } from '../auth/roles';

// Report visibility scope, resolved once and reused by every widget.
//   MASTER / MANAGER / ADMIN -> all reports (ADMIN global per 2026-07 policy)
//   PETUGAS                  -> only their own reports
type Scope =
  | { kind: 'all' }
  | { kind: 'user'; userId: string }
  | { kind: 'rtupp'; rtuppId: string };

/** Prisma typed-query `where` fragment for the resolved scope. */
function scopeWhereOf(scope: Scope): Record<string, unknown> {
  if (scope.kind === 'user') return { createdById: scope.userId };
  if (scope.kind === 'rtupp') return { createdBy: { rtuppId: scope.rtuppId } };
  return {};
}

/** Activity-log variant of the scope `where` (logs key off `userId`/`user`). */
function activityScopeWhereOf(scope: Scope): Record<string, unknown> {
  if (scope.kind === 'user') return { userId: scope.userId };
  if (scope.kind === 'rtupp') return { user: { rtuppId: scope.rtuppId } };
  return {};
}

const num = (v: unknown): number => {
  if (v == null) return 0;
  const n = Number(typeof v === 'bigint' ? v.toString() : String(v));
  return Number.isFinite(n) ? n : 0;
};

const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * One grouped query for the per-day report count over `[since, now]`, scoped.
 * Replaces the previous per-day COUNT loop (2 queries × N days). Grouping runs
 * in PostgreSQL via TO_CHAR and is served by `idx_laporan_*_created`.
 *
 * PostgreSQL folds unquoted identifiers to lower case, so camelCase columns are
 * double-quoted verbatim ("createdById", "createdAt", "rtuppId").
 */
async function dailyCounts(
  table: 'laporan_awal' | 'laporan_akhir',
  scope: Scope,
  since: Date
): Promise<Map<string, number>> {
  const tbl = Prisma.raw(table);
  const join =
    scope.kind === 'rtupp' ? Prisma.sql`JOIN users u ON t."createdById" = u.id` : Prisma.empty;
  const where =
    scope.kind === 'rtupp'
      ? Prisma.sql`AND u."rtuppId" = ${scope.rtuppId}`
      : scope.kind === 'user'
        ? Prisma.sql`AND t."createdById" = ${scope.userId}`
        : Prisma.empty;

  const rows = await prisma.$queryRaw<{ d: string; c: unknown }[]>`
    SELECT TO_CHAR(t."createdAt", 'YYYY-MM-DD') AS d, COUNT(*) AS c
    FROM ${tbl} t ${join}
    WHERE t."createdAt" >= ${since} ${where}
    GROUP BY d
  `;
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.d, num(r.c));
  return map;
}

// Aggregate Prisma groupBy([status]) rows into a flat status tally.
type StatusGroup = { status: string | null; _count: { _all: number } };
function tallyStatus(rows: StatusGroup[]) {
  const t = { total: 0, DRAFT: 0, PENDING: 0, APPROVED: 0, REJECTED: 0, REVISED: 0 };
  for (const r of rows) {
    const c = r._count._all;
    t.total += c;
    const key = (r.status ?? '') as keyof typeof t;
    if (key in t && key !== 'total') t[key] += c;
  }
  return t;
}

export const getDashboardStats = async (req: AuthRequest, res: Response): Promise<void> => {
  const getFallbackData = () => ({
    success: true,
    message: 'Dashboard stats retrieved successfully',
    data: {
      totalToday: 0,
      pendingReports: 0,
      approvedReports: 0,
      rejectedReports: 0,
      totalReports: 0,
      recentActivities: [],
      trend: [],
    },
  });

  try {
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId) {
      errorResponse(res, 'User not authenticated', 401);
      return;
    }

    // Resolve the visibility scope once. ADMIN joins MASTER/MANAGER on the
    // global view; only PETUGAS narrows to their own reports.
    let scope: Scope = { kind: 'all' };
    if (isFieldOfficer(userRole)) {
      scope = { kind: 'user', userId };
    }

    const scopeWhere = scopeWhereOf(scope);
    const activityScopeWhere = activityScopeWhereOf(scope);

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const todayWhere = { ...scopeWhere, createdAt: { gte: today, lt: tomorrow } };

      // 14-day trend window (inclusive) used by trendReports.
      const since = new Date(today);
      since.setDate(since.getDate() - 13);

      // ── Everything below runs in ONE parallel batch ──────────────────────
      // Status tallies (1 grouped query / table) replace the previous 9
      // individual COUNTs; per-day trend is 1 grouped query / table replacing
      // the 28-query loop; the dead 7-day trend loop is removed entirely.
      const [
        awalStatus,
        akhirStatus,
        awalToday,
        akhirToday,
        recentActivities,
        awalReports,
        akhirReports,
        awalDaily,
        akhirDaily,
        awalJobs,
        akhirJobs,
      ] = await Promise.all([
        prisma.laporanAwal.groupBy({ by: ['status'], where: scopeWhere, _count: { _all: true } }),
        prisma.laporanAkhir.groupBy({ by: ['status'], where: scopeWhere, _count: { _all: true } }),
        prisma.laporanAwal.count({ where: todayWhere }),
        prisma.laporanAkhir.count({ where: todayWhere }),
        prisma.activityLog.findMany({
          where: activityScopeWhere,
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            action: true,
            entityType: true,
            createdAt: true,
            user: { select: { name: true } },
          },
        }),
        prisma.laporanAwal.findMany({
          where: scopeWhere,
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            reportId: true,
            lokasiGardu: true,
            pekerjaan: true,
            status: true,
            createdAt: true,
          },
        }),
        prisma.laporanAkhir.findMany({
          where: scopeWhere,
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            reportId: true,
            namaAset: true,
            bayPosisi: true,
            pekerjaan: true,
            status: true,
            createdAt: true,
          },
        }),
        dailyCounts('laporan_awal', scope, since),
        dailyCounts('laporan_akhir', scope, since),
        prisma.laporanAwal.groupBy({
          by: ['pekerjaan'],
          where: scopeWhere,
          _count: { pekerjaan: true },
        }),
        prisma.laporanAkhir.groupBy({
          by: ['pekerjaan'],
          where: scopeWhere,
          _count: { pekerjaan: true },
        }),
      ]);

      const awal = tallyStatus(awalStatus as StatusGroup[]);
      const akhir = tallyStatus(akhirStatus as StatusGroup[]);

      const pendingReports = awal.PENDING + akhir.PENDING;
      const approvedReports = awal.APPROVED + akhir.APPROVED;
      const rejectedReports = awal.REJECTED + akhir.REJECTED;
      const draftReports = awal.DRAFT; // legacy behaviour: draft tracked on Awal only

      // Recent reports — combine, sort, take 5 (in-memory over ≤10 rows).
      const normalizedAwal = awalReports.map((r) => ({
        id: r.id,
        reportId: r.reportId,
        jenis: 'Awal' as const,
        lokasi: r.lokasiGardu || '-',
        pekerjaan: r.pekerjaan || '-',
        status: r.status,
        createdAt: r.createdAt,
      }));
      const normalizedAkhir = akhirReports.map((r) => ({
        id: r.id,
        reportId: r.reportId,
        jenis: 'Akhir' as const,
        lokasi: r.namaAset || r.bayPosisi || r.pekerjaan || '-',
        pekerjaan: r.pekerjaan || '-',
        status: r.status,
        createdAt: r.createdAt,
      }));
      const recentReports = [...normalizedAwal, ...normalizedAkhir]
        .sort((a, b) => {
          const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bt - at;
        })
        .slice(0, 5);

      // 14-day trend series — assemble the skeleton in JS, fill from the two
      // grouped maps (no per-day query).
      const trendReports: Array<{ date: string; awal: number; akhir: number }> = [];
      for (let i = 13; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const key = dayKey(date);
        trendReports.push({
          date: date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
          awal: awalDaily.get(key) ?? 0,
          akhir: akhirDaily.get(key) ?? 0,
        });
      }

      // Job statistics — merge the two pekerjaan tallies, top 5.
      const jobMap = new Map<string, number>();
      for (const j of awalJobs) {
        if (j.pekerjaan) jobMap.set(j.pekerjaan, (jobMap.get(j.pekerjaan) || 0) + j._count.pekerjaan);
      }
      for (const j of akhirJobs) {
        if (j.pekerjaan) jobMap.set(j.pekerjaan, (jobMap.get(j.pekerjaan) || 0) + j._count.pekerjaan);
      }
      const jobStatistics = Array.from(jobMap.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);

      const dashboardPayload = {
        totalToday: awalToday + akhirToday,
        totalReports: awal.total + akhir.total,
        pendingReports,
        approvedReports,
        rejectedReports,
        draftReports,
        recentActivities,
        recentReports,
        trendReports,
        statusDistribution: [
          { name: 'Approved', value: approvedReports },
          { name: 'Pending', value: pendingReports },
          { name: 'Rejected', value: rejectedReports },
          { name: 'Draft', value: draftReports },
        ],
        deviceConditions: [], // retired with the Speedometer module
        jobStatistics,
      };

      successResponse(res, dashboardPayload, 'Dashboard stats retrieved successfully');
    } catch (queryError: unknown) {
      const error = queryError as Error;
      console.error('[DASHBOARD STATS QUERY ERROR]', {
        message: error?.message || 'Unknown error',
        stack: error?.stack || 'No stack trace',
      });
      successResponse(res, getFallbackData());
    }
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[DASHBOARD STATS ERROR]', {
      message: err?.message || 'Unknown error',
      stack: err?.stack || 'No stack trace',
    });
    successResponse(res, getFallbackData());
  }
};
