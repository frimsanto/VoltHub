import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LeaderboardService, BADGES } from './leaderboard.service';
import type { LeaderboardRepository, TeamActivityCounts } from './leaderboard.repository';
import { ForbiddenError, ValidationError } from '../../utils/appError';

const team = (id: string, name: string, code = id.toUpperCase()) => ({
  id,
  name,
  code,
  leaderName: `Leader ${name}`,
});

const counts = (over: Partial<TeamActivityCounts> = {}): TeamActivityCounts => ({
  woCompleted: 0,
  inspeksiCount: 0,
  harCount: 0,
  laporanApproved: 0,
  laporanRejected: 0,
  ...over,
});

const admin = { userId: 'admin-1', role: 'ADMIN', rtuppId: 'rtupp-1' };

describe('LeaderboardService', () => {
  let mockRepo: {
    findActiveTeams: ReturnType<typeof vi.fn>;
    findUserRtuppId: ReturnType<typeof vi.fn>;
    getMonthlyActivity: ReturnType<typeof vi.fn>;
  };
  let service: LeaderboardService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepo = {
      findActiveTeams: vi.fn().mockResolvedValue([]),
      findUserRtuppId: vi.fn().mockResolvedValue(null),
      getMonthlyActivity: vi.fn().mockResolvedValue(new Map()),
    };
    service = new LeaderboardService(mockRepo as unknown as LeaderboardRepository);
  });

  it('empty month: teams come back with zero metrics, score 0 and NO badges', async () => {
    mockRepo.findActiveTeams.mockResolvedValue([team('t1', 'Alpha'), team('t2', 'Bravo')]);
    mockRepo.getMonthlyActivity.mockResolvedValue(
      new Map([
        ['t1', counts()],
        ['t2', counts()],
      ])
    );

    const result = await service.getLeaderboard(admin, { month: '2026-06' });

    expect(result.month).toBe('2026-06');
    expect(result.rtuppId).toBe('rtupp-1');
    expect(result.teams).toHaveLength(2);
    for (const t of result.teams) {
      expect(t.score).toBe(0);
      expect(t.woCompleted).toBe(0);
      expect(t.inspeksiCount).toBe(0);
      expect(t.harCount).toBe(0);
      expect(t.laporanApproved).toBe(0);
      // A month with zero activity must award nothing — not even Tim Terbaik.
      expect(t.badges).toEqual([]);
    }
    // All-zero scores dense-rank together at 1.
    expect(result.teams.map((t) => t.rank)).toEqual([1, 1]);

    // The requested month is passed to the repo as [start, end).
    const [, start, end] = mockRepo.getMonthlyActivity.mock.calls[0];
    expect(start).toEqual(new Date(2026, 5, 1));
    expect(end).toEqual(new Date(2026, 6, 1));
  });

  it('tie-break: equal scores share a dense rank and the next score gets rank+1', async () => {
    mockRepo.findActiveTeams.mockResolvedValue([
      team('t1', 'Alpha'),
      team('t2', 'Bravo'),
      team('t3', 'Charlie'),
    ]);
    // t1: 2 WO = 20 pts; t2: 4 inspeksi = 20 pts; t3: 1 laporan = 3 pts.
    mockRepo.getMonthlyActivity.mockResolvedValue(
      new Map([
        ['t1', counts({ woCompleted: 2 })],
        ['t2', counts({ inspeksiCount: 4 })],
        ['t3', counts({ laporanApproved: 1 })],
      ])
    );

    const result = await service.getLeaderboard(admin, { month: '2026-06' });
    const byId = Object.fromEntries(result.teams.map((t) => [t.teamId, t]));

    expect(byId.t1.score).toBe(20);
    expect(byId.t2.score).toBe(20);
    expect(byId.t3.score).toBe(3);
    expect(byId.t1.rank).toBe(1);
    expect(byId.t2.rank).toBe(1);
    expect(byId.t3.rank).toBe(2); // dense: 1,1,2 — not 1,1,3
    // Both rank-1 teams are Tim Terbaik.
    expect(byId.t1.badges).toContain(BADGES.TIM_TERBAIK);
    expect(byId.t2.badges).toContain(BADGES.TIM_TERBAIK);
    expect(byId.t3.badges).not.toContain(BADGES.TIM_TERBAIK);
  });

  it('badge assignment: champions per metric, Zero Reject and Perfect Month', async () => {
    mockRepo.findActiveTeams.mockResolvedValue([team('t1', 'Alpha'), team('t2', 'Bravo')]);
    mockRepo.getMonthlyActivity.mockResolvedValue(
      new Map([
        // t1: best at everything, no rejects → all six badges.
        ['t1', counts({ woCompleted: 3, inspeksiCount: 5, harCount: 2, laporanApproved: 4 })],
        // t2: some activity but a reject and zero HAR → no Zero Reject / Perfect Month.
        ['t2', counts({ woCompleted: 1, inspeksiCount: 1, laporanApproved: 1, laporanRejected: 2 })],
      ])
    );

    const result = await service.getLeaderboard(admin, { month: '2026-06' });
    const byId = Object.fromEntries(result.teams.map((t) => [t.teamId, t]));

    expect(byId.t1.score).toBe(3 * 10 + 5 * 5 + 2 * 8 + 4 * 3); // 83
    expect(byId.t1.badges).toEqual(
      expect.arrayContaining([
        BADGES.TIM_TERBAIK,
        BADGES.WO_CHAMPION,
        BADGES.INSPECTION_PRO,
        BADGES.HAR_EXPERT,
        BADGES.ZERO_REJECT,
        BADGES.PERFECT_MONTH,
      ])
    );
    expect(byId.t2.badges).toEqual([]); // beaten on every metric, has a reject, no HAR
  });

  it('PETUGAS is pinned to their own RTUPP even when requesting another', async () => {
    mockRepo.findActiveTeams.mockResolvedValue([]);
    const result = await service.getLeaderboard(
      { userId: 'p-1', role: 'PETUGAS', rtuppId: 'rtupp-own' },
      { rtuppId: 'rtupp-other' }
    );
    expect(result.rtuppId).toBe('rtupp-own');
    expect(mockRepo.findActiveTeams).toHaveBeenCalledWith('rtupp-own');

    // PETUGAS without any RTUPP is denied fail-closed.
    await expect(
      service.getLeaderboard({ userId: 'p-2', role: 'PETUGAS', rtuppId: null }, {})
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects a malformed month and requires rtuppId for accounts without one', async () => {
    await expect(service.getLeaderboard(admin, { month: '06-2026' })).rejects.toBeInstanceOf(
      ValidationError
    );
    await expect(service.getLeaderboard(admin, { month: '2026-13' })).rejects.toBeInstanceOf(
      ValidationError
    );
    // MASTER without rtuppId claim and no explicit param → ValidationError.
    await expect(
      service.getLeaderboard({ userId: 'm-1', role: 'MASTER', rtuppId: null }, {})
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
