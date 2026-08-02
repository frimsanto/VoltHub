import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GiDashboardService } from './gi-dashboard.service';

describe('GiDashboardService', () => {
  let mockRepo: any;

  beforeEach(() => {
    mockRepo = {
      getUserRtuppId: vi.fn().mockResolvedValue('rtupp-1-uuid'),
      getTeams: vi.fn().mockResolvedValue([
        { id: 'team-a', name: 'Tim A' },
        { id: 'team-b', name: 'Tim B' },
      ]),
      getPetugasUsers: vi.fn().mockResolvedValue([
        { id: 'user-1', name: 'Petugas 1', teamId: 'team-a', rtupp: { name: 'RTUPP 1' }, team: { name: 'Tim A' } },
        { id: 'user-2', name: 'Petugas 2', teamId: 'team-b', rtupp: { name: 'RTUPP 1' }, team: { name: 'Tim B' } },
      ]),
      getWorkOrders: vi.fn().mockResolvedValue([
        {
          id: 'wo-2',
          type: 'PREVENTIVE',
          status: 'WAITING_APPROVAL',
          hasilRC: 'BERHASIL',
          hasilLR: 'BERHASIL',
          hasilES: 'BERHASIL',
          teamId: 'team-b',
          assignedToId: 'user-2',
          location: { name: 'GI KEBON JERUK', code: 'GI-KEBON-JERUK' },
          team: { name: 'Tim B' },
          assignedTo: { name: 'Petugas 2' },
          createdAt: new Date('2026-06-24T01:00:00Z'),
        },
        {
          id: 'wo-1',
          type: 'CORRECTIVE',
          status: 'APPROVED',
          hasilRC: 'BERHASIL',
          hasilLR: 'BERHASIL',
          hasilES: 'GAGAL',
          teamId: 'team-a',
          assignedToId: 'user-1',
          location: { name: 'GI KEMAYORAN', code: 'GI-KEMAYORAN' },
          team: { name: 'Tim A' },
          assignedTo: { name: 'Petugas 1' },
          createdAt: new Date('2026-06-24T00:00:00Z'),
        },
      ]),
    };
  });

  it('calculates GI Dashboard overview metrics correctly', async () => {
    const service = new GiDashboardService(mockRepo);
    const result = await service.getOverview('admin-user-id', 'ADMIN');

    // ADMIN is global per the 2026-07 data-access policy.
    expect(result.scope.level).toBe('GLOBAL');
    expect(result.scope.rtuppId).toBeNull();

    // 1 Corrective WO (wo-1), 1 Preventive WO (wo-2)
    expect(result.summary.inspeksi.total).toBe(1);
    expect(result.summary.har.total).toBe(1);
    expect(result.summary.pendingValidation).toBe(1); // WAITING_APPROVAL count

    // rcSuccessRate calculation: wo-1 (CORRECTIVE) has 2 BERHASIL, 1 GAGAL -> not all three BERHASIL -> 0%
    expect(result.summary.rcSuccessRate).toBe(0);

    // sesuaiRate calculation: wo-2 (PREVENTIVE) has 3 BERHASIL -> 3/3 = 100%
    expect(result.summary.sesuaiRate).toBe(100);

    // perTeam stats
    const teamARow = result.perTeam.find(t => t.teamId === 'team-a');
    expect(teamARow?.har).toBe(1);
    expect(teamARow?.inspeksi).toBe(0);
    expect(teamARow?.rcSuccess).toBe(0);

    // recent list sorted (wo-2 first due to later createdAt/submittedAt)
    expect(result.recent.length).toBe(2);
    expect(result.recent[0].id).toBe('wo-2');
  });

  it('calculates GI Leaderboard correctly and sorts by validated DESC', async () => {
    const service = new GiDashboardService(mockRepo);
    const result = await service.getLeaderboard('admin-user-id', 'ADMIN');

    expect(result.length).toBe(2);
    
    // Petugas 1 has 1 validated WO, Petugas 2 has 0 validated WOs (WAITING_APPROVAL).
    // So Petugas 1 should be ranked first.
    expect(result[0].petugasId).toBe('user-1');
    expect(result[0].validated).toBe(1);
    expect(result[0].rcSuccessRate).toBe(0);
  });
});
