import { isFieldOfficer } from '../../auth/roles';
import { ForbiddenError, ValidationError } from '../../utils/appError';
import {
  leaderboardRepository,
  LeaderboardRepository,
  TeamActivityCounts,
} from './leaderboard.repository';

/**
 * Leaderboard Service — monthly team ranking within one RTUPP.
 *
 * Scoring (weights tunable later):
 *   score = woCompleted×10 + inspeksiCount×5 + harCount×8 + laporanApproved×3
 *
 * Ranking is DENSE: tied scores share a rank, the next distinct score gets
 * rank+1 (100,100,80 → 1,1,2).
 *
 * Access: every authenticated role may call it, but PETUGAS is pinned to their
 * own RTUPP (any requested rtuppId is ignored, fail-closed when the account
 * has none). Other roles may query any RTUPP; without an explicit rtuppId the
 * caller's own RTUPP is used.
 */

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

export interface LeaderboardResult {
  rtuppId: string;
  /** "YYYY-MM" actually used (defaulted to the current month when omitted). */
  month: string;
  teams: LeaderboardEntry[];
  generatedAt: string;
}

export interface LeaderboardActor {
  userId: string;
  role?: string | null;
  rtuppId?: string | null;
}

export interface LeaderboardQuery {
  rtuppId?: string;
  month?: string;
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export const SCORE_WEIGHTS = { wo: 10, inspeksi: 5, har: 8, laporan: 3 } as const;

export const BADGES = {
  TIM_TERBAIK: '🏆 Tim Terbaik',
  WO_CHAMPION: '⚡ WO Champion',
  INSPECTION_PRO: '🔍 Inspection Pro',
  HAR_EXPERT: '🛡️ HAR Expert',
  ZERO_REJECT: '📋 Zero Reject',
  PERFECT_MONTH: '🔥 Perfect Month',
} as const;

export class LeaderboardService {
  constructor(private readonly repo: LeaderboardRepository = leaderboardRepository) {}

  async getLeaderboard(actor: LeaderboardActor | undefined, query: LeaderboardQuery): Promise<LeaderboardResult> {
    if (!actor?.userId) throw new ForbiddenError('Authentication required');

    const rtuppId = await this.resolveRtuppId(actor, query.rtuppId);
    const { start, end, label } = this.monthRange(query.month);

    const teams = await this.repo.findActiveTeams(rtuppId);
    const activity = await this.repo.getMonthlyActivity(teams.map((t) => t.id), start, end);

    const rejectedByTeam = new Map<string, number>();
    const entries: LeaderboardEntry[] = teams.map((t) => {
      const c: TeamActivityCounts = activity.get(t.id) ?? {
        woCompleted: 0,
        inspeksiCount: 0,
        harCount: 0,
        laporanApproved: 0,
        laporanRejected: 0,
      };
      rejectedByTeam.set(t.id, c.laporanRejected);
      return {
        teamId: t.id,
        teamName: t.name,
        teamCode: t.code,
        leaderName: t.leaderName,
        score: this.score(c),
        rank: 0, // assigned below
        woCompleted: c.woCompleted,
        inspeksiCount: c.inspeksiCount,
        harCount: c.harCount,
        laporanApproved: c.laporanApproved,
        badges: [],
      };
    });

    this.assignRanks(entries);
    this.assignBadges(entries, rejectedByTeam);

    return { rtuppId, month: label, teams: entries, generatedAt: new Date().toISOString() };
  }

  /** PETUGAS → always own RTUPP (fail-closed); others → requested ?? own. */
  private async resolveRtuppId(actor: LeaderboardActor, requested?: string): Promise<string> {
    if (isFieldOfficer(actor.role)) {
      const own = actor.rtuppId ?? (await this.repo.findUserRtuppId(actor.userId));
      if (!own) {
        throw new ForbiddenError(
          'Akun Anda belum terhubung ke RTUPP. Hubungi administrator untuk mendapatkan akses.'
        );
      }
      return own;
    }
    if (requested) return requested;
    const own = actor.rtuppId ?? (await this.repo.findUserRtuppId(actor.userId));
    if (!own) throw new ValidationError('Parameter rtuppId wajib diisi untuk akun tanpa RTUPP');
    return own;
  }

  /** Parse "YYYY-MM" (default: current month) → [start, end) plus the label. */
  private monthRange(month?: string): { start: Date; end: Date; label: string } {
    if (month !== undefined && !MONTH_RE.test(month)) {
      throw new ValidationError('Parameter month harus berformat YYYY-MM');
    }
    const now = new Date();
    const [y, m] = month
      ? month.split('-').map(Number)
      : [now.getFullYear(), now.getMonth() + 1];
    return {
      start: new Date(y, m - 1, 1),
      end: new Date(y, m, 1),
      label: `${y}-${String(m).padStart(2, '0')}`,
    };
  }

  private score(c: TeamActivityCounts): number {
    return (
      c.woCompleted * SCORE_WEIGHTS.wo +
      c.inspeksiCount * SCORE_WEIGHTS.inspeksi +
      c.harCount * SCORE_WEIGHTS.har +
      c.laporanApproved * SCORE_WEIGHTS.laporan
    );
  }

  /** Sort by score desc (name asc as stable tie order) and dense-rank in place. */
  private assignRanks(entries: LeaderboardEntry[]): void {
    entries.sort((a, b) => b.score - a.score || a.teamName.localeCompare(b.teamName, 'id'));
    let rank = 0;
    let prevScore = Number.NaN;
    for (const e of entries) {
      if (e.score !== prevScore) {
        rank += 1;
        prevScore = e.score;
      }
      e.rank = rank;
    }
  }

  /**
   * Badge rules (server-side). The "top of the RTUPP" badges require the
   * winning metric to be > 0 — a month with zero activity awards nothing.
   */
  private assignBadges(entries: LeaderboardEntry[], rejectedByTeam: Map<string, number>): void {
    if (entries.length === 0) return;
    const max = (pick: (e: LeaderboardEntry) => number) =>
      entries.reduce((m, e) => Math.max(m, pick(e)), 0);
    const maxWo = max((e) => e.woCompleted);
    const maxInspeksi = max((e) => e.inspeksiCount);
    const maxHar = max((e) => e.harCount);

    for (const e of entries) {
      if (e.rank === 1 && e.score > 0) e.badges.push(BADGES.TIM_TERBAIK);
      if (maxWo > 0 && e.woCompleted === maxWo) e.badges.push(BADGES.WO_CHAMPION);
      if (maxInspeksi > 0 && e.inspeksiCount === maxInspeksi) e.badges.push(BADGES.INSPECTION_PRO);
      if (maxHar > 0 && e.harCount === maxHar) e.badges.push(BADGES.HAR_EXPERT);
      if (e.laporanApproved > 0 && (rejectedByTeam.get(e.teamId) ?? 0) === 0) {
        e.badges.push(BADGES.ZERO_REJECT);
      }
      if (e.woCompleted > 0 && e.inspeksiCount > 0 && e.harCount > 0 && e.laporanApproved > 0) {
        e.badges.push(BADGES.PERFECT_MONTH);
      }
    }
  }
}

export const leaderboardService = new LeaderboardService();
