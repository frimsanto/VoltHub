import { ReportStatus, WorkOrderStatus } from '@prisma/client';
import prisma from '../../config/database';

/**
 * Leaderboard Repository — per-team monthly activity for one RTUPP.
 *
 * No new tables: everything is computed on the fly from existing rows.
 * Only WorkOrder carries a direct `teamId`; the laporan inspeksi/HAR models
 * (LaporanGi / LaporanInspeksiGh / LaporanInspeksiMp and the HAR trio) and
 * LaporanAwal only carry a user FK (`inspectorId` / `createdById`), so those
 * are attributed to a team via the author's `User.teamId`.
 *
 * NOTE: `inspeksi_gardu_records` (InspeksiGarduRecord) is deliberately NOT
 * counted — it is the bulk SCADA Excel import dataset and carries no user/team
 * linkage (only a free-text `userEmail` from the source file), so counting it
 * would credit imports, not field-team work.
 */

export interface LeaderboardTeam {
  id: string;
  name: string;
  code: string;
  leaderName: string | null;
}

export interface TeamActivityCounts {
  woCompleted: number;
  inspeksiCount: number;
  harCount: number;
  laporanApproved: number;
  /** For the "📋 Zero Reject" badge — not exposed in the response shape. */
  laporanRejected: number;
}

const EMPTY_COUNTS: TeamActivityCounts = {
  woCompleted: 0,
  inspeksiCount: 0,
  harCount: 0,
  laporanApproved: 0,
  laporanRejected: 0,
};

/** Shared row shape of the six per-inspector groupBy queries below. */
type InspectorCountRow = { inspectorId: string | null; _count: { _all: number } };

export class LeaderboardRepository {
  /** Active teams of the RTUPP (leader name resolved for display). */
  async findActiveTeams(rtuppId: string): Promise<LeaderboardTeam[]> {
    const teams = await prisma.team.findMany({
      where: { rtuppId, isActive: true },
      select: {
        id: true,
        name: true,
        code: true,
        users_teams_leaderIdTousers: { select: { name: true } },
      },
      orderBy: { name: 'asc' },
    });
    return teams.map((t) => ({
      id: t.id,
      name: t.name,
      code: t.code,
      leaderName: t.users_teams_leaderIdTousers?.name ?? null,
    }));
  }

  /** User's rtuppId — fallback when the JWT carries no tenant claim. */
  async findUserRtuppId(userId: string): Promise<string | null> {
    const row = await prisma.user.findUnique({ where: { id: userId }, select: { rtuppId: true } });
    return row?.rtuppId ?? null;
  }

  /**
   * All four metrics for the given teams within [monthStart, monthEnd), keyed
   * by teamId. Fired as parallel indexed groupBy queries — no per-team loop.
   */
  async getMonthlyActivity(
    teamIds: string[],
    monthStart: Date,
    monthEnd: Date
  ): Promise<Map<string, TeamActivityCounts>> {
    const byTeam = new Map<string, TeamActivityCounts>(
      teamIds.map((id) => [id, { ...EMPTY_COUNTS }])
    );
    if (teamIds.length === 0) return byTeam;

    // userId → teamId map: the laporan models only carry the author's user FK.
    const members = await prisma.user.findMany({
      where: { teamId: { in: teamIds } },
      select: { id: true, teamId: true },
    });
    const teamOfUser = new Map(members.map((m) => [m.id, m.teamId as string]));
    const userIds = members.map((m) => m.id);

    const inMonth = { gte: monthStart, lt: monthEnd };
    const inspectorWhere = { inspectorId: { in: userIds }, deletedAt: null, reportDate: inMonth };
    const countAll = { _all: true } as const;
    const none: InspectorCountRow[] = [];

    const [wo, giInsp, ghInsp, mpInsp, giHar, ghHar, mpHar, awalApproved, awalRejected] =
      await Promise.all([
        prisma.workOrder.groupBy({
          by: ['teamId'],
          where: {
            teamId: { in: teamIds },
            deletedAt: null,
            status: { in: [WorkOrderStatus.APPROVED, WorkOrderStatus.CLOSED] },
            updatedAt: inMonth,
          },
          _count: countAll,
        }),
        userIds.length === 0
          ? none
          : prisma.laporanGi.groupBy({ by: ['inspectorId'], where: inspectorWhere, _count: countAll }),
        userIds.length === 0
          ? none
          : prisma.laporanInspeksiGh.groupBy({ by: ['inspectorId'], where: inspectorWhere, _count: countAll }),
        userIds.length === 0
          ? none
          : prisma.laporanInspeksiMp.groupBy({ by: ['inspectorId'], where: inspectorWhere, _count: countAll }),
        userIds.length === 0
          ? none
          : prisma.laporanHarGi.groupBy({ by: ['inspectorId'], where: inspectorWhere, _count: countAll }),
        userIds.length === 0
          ? none
          : prisma.laporanHarGh.groupBy({ by: ['inspectorId'], where: inspectorWhere, _count: countAll }),
        userIds.length === 0
          ? none
          : prisma.laporanHarMp.groupBy({ by: ['inspectorId'], where: inspectorWhere, _count: countAll }),
        userIds.length === 0
          ? []
          : prisma.laporanAwal.groupBy({
              by: ['createdById'],
              where: { createdById: { in: userIds }, status: ReportStatus.APPROVED, updatedAt: inMonth },
              _count: countAll,
            }),
        userIds.length === 0
          ? []
          : prisma.laporanAwal.groupBy({
              by: ['createdById'],
              where: { createdById: { in: userIds }, status: ReportStatus.REJECTED, updatedAt: inMonth },
              _count: countAll,
            }),
      ]);

    const bump = (teamId: string | null | undefined, key: keyof TeamActivityCounts, n: number) => {
      if (!teamId) return;
      const counts = byTeam.get(teamId);
      if (counts) counts[key] += n;
    };
    const bumpByInspector = (rows: InspectorCountRow[], key: keyof TeamActivityCounts) => {
      for (const r of rows) {
        bump(r.inspectorId ? teamOfUser.get(r.inspectorId) : null, key, r._count._all);
      }
    };

    for (const r of wo) bump(r.teamId, 'woCompleted', r._count._all);
    bumpByInspector(giInsp, 'inspeksiCount');
    bumpByInspector(ghInsp, 'inspeksiCount');
    bumpByInspector(mpInsp, 'inspeksiCount');
    bumpByInspector(giHar, 'harCount');
    bumpByInspector(ghHar, 'harCount');
    bumpByInspector(mpHar, 'harCount');
    for (const r of awalApproved) bump(teamOfUser.get(r.createdById), 'laporanApproved', r._count._all);
    for (const r of awalRejected) bump(teamOfUser.get(r.createdById), 'laporanRejected', r._count._all);

    return byTeam;
  }
}

export const leaderboardRepository = new LeaderboardRepository();
