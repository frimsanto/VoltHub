import { giDashboardRepository, GiDashboardRepository } from './gi-dashboard.repository';
import { ForbiddenError } from '../../utils/appError';
import { hasGlobalScope, isMaster } from '../../auth/roles';
import { WorkOrderStatus } from '@prisma/client';

export interface GiStatusCounts {
  total: number;
  DRAFT: number;
  SUBMITTED: number;
  VALIDATED: number;
  REJECTED: number;
}

export interface GiTeamRow {
  teamId: string | null;
  teamName: string;
  inspeksi: number;
  har: number;
  validated: number;
  rcSuccess: number;
  total: number;
}

export interface GiRecentRow {
  type: 'INSPEKSI' | 'HAR';
  id: string;
  gardu: string;
  team: string;
  status: 'DRAFT' | 'SUBMITTED' | 'VALIDATED' | 'REJECTED';
  reportDate: string;
}

export interface GiDashboard {
  scope: { level: 'GLOBAL' | 'RTUPP'; rtuppId?: string | null };
  summary: {
    inspeksi: GiStatusCounts;
    har: GiStatusCounts;
    pendingValidation: number;
    rcSuccessRate: number;
    sesuaiRate: number;
  };
  perTeam: GiTeamRow[];
  recent: GiRecentRow[];
}

export interface GiLeaderRow {
  petugasId: string;
  petugasName: string;
  rtuppName: string;
  teamName: string;
  total: number;
  validated: number;
  rcSuccessRate: number;
}

export class GiDashboardService {
  constructor(private readonly repo: GiDashboardRepository = giDashboardRepository) {}

  private async resolveScope(
    userId: string,
    role?: string | null
  ): Promise<{ level: 'GLOBAL' | 'RTUPP'; rtuppId: string | null }> {
    if (isMaster(role)) return { level: 'GLOBAL', rtuppId: null };
    const rtuppId = await this.repo.getUserRtuppId(userId);
    // MASTER/ADMIN/Manager-UP3 global (ADMIN per 2026-07 policy); ASMEN
    // (MANAGER + rtuppId) and PETUGAS stay scoped.
    if (hasGlobalScope(role, rtuppId)) return { level: 'GLOBAL', rtuppId: null };
    if (!rtuppId) {
      throw new ForbiddenError('Akun Anda belum terhubung ke RTUPP untuk melihat dashboard GI');
    }
    return { level: 'RTUPP', rtuppId };
  }

  async getOverview(userId: string, role?: string | null): Promise<GiDashboard> {
    const scope = await this.resolveScope(userId, role);
    const { rtuppId } = scope;

    const [workOrders, activeTeams] = await Promise.all([
      this.repo.getWorkOrders(rtuppId),
      this.repo.getTeams(rtuppId),
    ]);

    // 1. Initialize status counts
    const inspeksiCounts: GiStatusCounts = { total: 0, DRAFT: 0, SUBMITTED: 0, VALIDATED: 0, REJECTED: 0 };
    const harCounts: GiStatusCounts = { total: 0, DRAFT: 0, SUBMITTED: 0, VALIDATED: 0, REJECTED: 0 };

    let pendingValidation = 0;

    // Remote test aggregates
    let harSuccess = 0;
    let harTotalEval = 0;
    let inspSuccess = 0;
    let inspTotalEval = 0;

    // 2. Initialize team mapping
    const teamMap = new Map<string, GiTeamRow>();
    for (const t of activeTeams) {
      teamMap.set(t.id, {
        teamId: t.id,
        teamName: t.name,
        inspeksi: 0,
        har: 0,
        validated: 0,
        rcSuccess: 0,
        total: 0,
      });
    }

    // 3. Process work orders
    const processedWos: GiRecentRow[] = [];

    for (const wo of workOrders) {
      const isPreventive = wo.type === 'PREVENTIVE';
      const counts = isPreventive ? inspeksiCounts : harCounts;

      counts.total += 1;

      // Status mapping
      let mappedStatus: GiRecentRow['status'] = 'DRAFT';
      if (['DRAFT', 'ASSIGNED', 'ON_PROGRESS'].includes(wo.status)) {
        counts.DRAFT += 1;
        mappedStatus = 'DRAFT';
      } else if (wo.status === 'WAITING_APPROVAL') {
        counts.SUBMITTED += 1;
        pendingValidation += 1;
        mappedStatus = 'SUBMITTED';
      } else if (['APPROVED', 'CLOSED'].includes(wo.status)) {
        counts.VALIDATED += 1;
        mappedStatus = 'VALIDATED';
      } else if (wo.status === 'REJECTED') {
        counts.REJECTED += 1;
        mappedStatus = 'REJECTED';
      }

      // Remote test results (hasilRC, hasilLR, hasilES)
      let woSuccessCount = 0;
      let woEvalCount = 0;

      const hasEval = [wo.hasilRC, wo.hasilLR, wo.hasilES].some(
        (res) => res === 'BERHASIL' || res === 'GAGAL'
      );
      if (hasEval) {
        woEvalCount = 1;
        if (
          wo.hasilRC === 'BERHASIL' &&
          wo.hasilLR === 'BERHASIL' &&
          wo.hasilES === 'BERHASIL'
        ) {
          woSuccessCount = 1;
        }
      }

      if (isPreventive) {
        inspSuccess += woSuccessCount;
        inspTotalEval += woEvalCount;
      } else {
        harSuccess += woSuccessCount;
        harTotalEval += woEvalCount;
      }

      // Team aggregations
      if (wo.teamId && teamMap.has(wo.teamId)) {
        const teamRow = teamMap.get(wo.teamId)!;
        teamRow.total += 1;
        if (isPreventive) {
          teamRow.inspeksi += 1;
        } else {
          teamRow.har += 1;
          teamRow.rcSuccess += woSuccessCount;
        }
        if (['APPROVED', 'CLOSED'].includes(wo.status)) {
          teamRow.validated += 1;
        }
      }

      // Recent rows mapping (limit to 10 most recent)
      if (processedWos.length < 10) {
        processedWos.push({
          type: isPreventive ? 'INSPEKSI' : 'HAR',
          id: wo.id,
          gardu: wo.location.name,
          team: wo.team?.name ?? '—',
          status: mappedStatus,
          reportDate: (wo.submittedAt ?? wo.createdAt).toISOString(),
        });
      }
    }

    const rcSuccessRate = harTotalEval > 0 ? Math.round((harSuccess / harTotalEval) * 100) : 0;
    const sesuaiRate = inspTotalEval > 0 ? Math.round((inspSuccess / inspTotalEval) * 100) : 0;

    return {
      scope: {
        level: scope.level,
        rtuppId: scope.rtuppId,
      },
      summary: {
        inspeksi: inspeksiCounts,
        har: harCounts,
        pendingValidation,
        rcSuccessRate,
        sesuaiRate,
      },
      perTeam: [...teamMap.values()],
      recent: processedWos,
    };
  }

  async getLeaderboard(userId: string, role?: string | null, limit = 10): Promise<GiLeaderRow[]> {
    const scope = await this.resolveScope(userId, role);
    const { rtuppId } = scope;

    const [workOrders, petugasUsers] = await Promise.all([
      this.repo.getWorkOrders(rtuppId),
      this.repo.getPetugasUsers(rtuppId),
    ]);

    // Process stats per Petugas — assignment is per-team, so a petugas's WOs are
    // whatever's assigned to their team.
    const leaders = petugasUsers.map((user) => {
      const assignedWos = user.teamId
        ? workOrders.filter((wo) => wo.teamId === user.teamId)
        : [];

      const total = assignedWos.length;
      const validated = assignedWos.filter((wo) => ['APPROVED', 'CLOSED'].includes(wo.status)).length;

      // Remote success rate for corrective/HAR work orders assigned to this user
      let userSuccess = 0;
      let userEval = 0;

      for (const wo of assignedWos) {
        if (wo.type === 'CORRECTIVE') {
          const hasEval = [wo.hasilRC, wo.hasilLR, wo.hasilES].some(
            (res) => res === 'BERHASIL' || res === 'GAGAL'
          );
          if (hasEval) {
            userEval += 1;
            if (
              wo.hasilRC === 'BERHASIL' &&
              wo.hasilLR === 'BERHASIL' &&
              wo.hasilES === 'BERHASIL'
            ) {
              userSuccess += 1;
            }
          }
        }
      }

      const rcSuccessRate = userEval > 0 ? Math.round((userSuccess / userEval) * 100) : 0;

      return {
        petugasId: user.id,
        petugasName: user.name,
        rtuppName: user.rtupp?.name ?? '—',
        teamName: user.team?.name ?? '—',
        total,
        validated,
        rcSuccessRate,
      };
    });

    // Sort by validated DESC, then total DESC
    leaders.sort((a, b) => {
      if (b.validated !== a.validated) {
        return b.validated - a.validated;
      }
      return b.total - a.total;
    });

    return leaders.slice(0, limit);
  }
}

export const giDashboardService = new GiDashboardService();
