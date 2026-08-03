import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockResponse } from '../__tests__/helpers/http';

// In-memory Prisma mock + stubbed audit (these hit the DB in real life).
vi.mock('../config/database');
vi.mock('../utils/audit', () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));
// Real Argon2id hashing is intentionally slow — stub it out for unit tests.
vi.mock('../utils/password', () => ({
  hashPassword: vi.fn().mockResolvedValue('argon2-hash'),
  verifyPassword: vi.fn(),
  isLegacyHash: vi.fn().mockReturnValue(false),
}));

import prisma, { resetPrismaMock } from '../config/database';
import {
  createUser,
  updateUser,
  deleteUser,
  resetPassword,
  getAllUsers,
} from './userController';
import type { AuthRequest } from '../middlewares/auth';

const anyPrisma = prisma as any;

// Build an AuthRequest with the given operator identity, params and body.
const reqWith = (
  user: { userId?: string; role?: string; rtuppId?: string | null } | undefined,
  params: Record<string, string> = {},
  body: Record<string, unknown> = {}
) => ({ user, params, body, query: {} }) as unknown as AuthRequest;

beforeEach(() => {
  resetPrismaMock();
  vi.clearAllMocks();
});

describe('createUser — target-role gate (Task 1)', () => {
  it('blocks PETUGAS (not a user-management role) with 403', async () => {
    const res = mockResponse();
    await createUser(reqWith({ userId: 'p1', role: 'PETUGAS' }), res);
    expect(res._status).toBe(403);
    expect(anyPrisma.user.create).not.toHaveBeenCalled();
  });

  it('blocks MANAGER from creating a MASTER account with 403', async () => {
    const res = mockResponse();
    await createUser(
      reqWith({ userId: 'm1', role: 'MANAGER' }, {}, {
        email: 'x@pln.co.id',
        password: 'secret1',
        name: 'X',
        role: 'MASTER',
      }),
      res
    );
    expect(res._status).toBe(403);
    expect(anyPrisma.user.create).not.toHaveBeenCalled();
  });

  it('blocks MANAGER from creating another MANAGER with 403', async () => {
    const res = mockResponse();
    await createUser(
      reqWith({ userId: 'm1', role: 'MANAGER' }, {}, {
        email: 'x@pln.co.id',
        password: 'secret1',
        name: 'X',
        role: 'MANAGER',
      }),
      res
    );
    expect(res._status).toBe(403);
  });
});

describe('updateUser — RTUPP isolation & escalation (Task 1 & 2)', () => {
  it('blocks ADMIN from editing a user in another RTUPP with 403', async () => {
    anyPrisma.user.findUnique.mockResolvedValue({
      id: 't1',
      role: 'PETUGAS',
      rtuppId: 'rtupp-B',
    });
    const res = mockResponse();
    await updateUser(
      reqWith({ userId: 'a1', role: 'ADMIN', rtuppId: 'rtupp-A' }, { id: 't1' }, { name: 'New' }),
      res
    );
    expect(res._status).toBe(403);
    expect(anyPrisma.user.update).not.toHaveBeenCalled();
  });

  it('blocks MANAGER from editing a MASTER account with 403', async () => {
    anyPrisma.user.findUnique.mockResolvedValue({ id: 't1', role: 'MASTER', rtuppId: null });
    const res = mockResponse();
    await updateUser(
      reqWith({ userId: 'm1', role: 'MANAGER' }, { id: 't1' }, { name: 'New' }),
      res
    );
    expect(res._status).toBe(403);
    expect(anyPrisma.user.update).not.toHaveBeenCalled();
  });
});

describe('deleteUser — user-management tier (Task 1)', () => {
  it('blocks MANAGER from deleting another MANAGER with 403', async () => {
    anyPrisma.user.findUnique.mockResolvedValue({ id: 't1', role: 'MANAGER', rtuppId: 'x' });
    const res = mockResponse();
    await deleteUser(
      reqWith({ userId: 'm1', role: 'MANAGER' }, { id: 't1' }),
      res
    );
    expect(res._status).toBe(403);
    expect(anyPrisma.user.delete).not.toHaveBeenCalled();
  });

  it('blocks PETUGAS from deleting anyone with 403', async () => {
    const res = mockResponse();
    await deleteUser(reqWith({ userId: 'p1', role: 'PETUGAS' }, { id: 't1' }), res);
    expect(res._status).toBe(403);
  });
});

describe('resetPassword — RTUPP isolation (Task 2)', () => {
  it('blocks ADMIN from resetting a password in another RTUPP with 403', async () => {
    anyPrisma.user.findUnique.mockResolvedValue({
      id: 't1',
      role: 'PETUGAS',
      rtuppId: 'rtupp-B',
      email: 't@pln.co.id',
      name: 'T',
    });
    const res = mockResponse();
    await resetPassword(
      reqWith({ userId: 'a1', role: 'ADMIN', rtuppId: 'rtupp-A' }, { id: 't1' }, { password: 'secret1' }),
      res
    );
    expect(res._status).toBe(403);
    expect(anyPrisma.user.update).not.toHaveBeenCalled();
  });
});

describe('getAllUsers — RTUPP filter (Task 2)', () => {
  it('scopes an ADMIN list query to its own RTUPP', async () => {
    anyPrisma.user.findMany.mockResolvedValue([]);
    const res = mockResponse();
    await getAllUsers(
      reqWith({ userId: 'a1', role: 'ADMIN', rtuppId: 'rtupp-A' }),
      res
    );
    expect(anyPrisma.user.findMany).toHaveBeenCalledOnce();
    const arg = anyPrisma.user.findMany.mock.calls[0][0];
    expect(arg.where.rtuppId).toBe('rtupp-A');
  });

  it('blocks read-only MANAGER from listing users (403, no query)', async () => {
    anyPrisma.user.findMany.mockResolvedValue([]);
    const res = mockResponse();
    await getAllUsers(reqWith({ userId: 'm1', role: 'MANAGER' }), res);
    expect(res._status).toBe(403);
    expect(anyPrisma.user.findMany).not.toHaveBeenCalled();
  });
});

// ── Security scenarios (Task A & B) ──────────────────────────────────────────
// These nail down the cross-RTUPP / cross-role boundaries: ADMIN is local to its
// RTUPP and manages only PETUGAS, MANAGER is read-only and manages no account,
// and a MASTER account is never deletable. Reference counts are all zero so a
// permitted delete reaches
// the hard-delete path (the soft-delete policy is exercised elsewhere).
const zeroCounts = {
  activityLogs: 0,
  attachments: 0,
  validations: 0,
  laporanAwalCreated: 0,
  laporanAkhirCreated: 0,
  laporanAwalUpdated: 0,
  laporanAkhirUpdated: 0,
  laporanAwalApproved: 0,
  laporanAkhirApproved: 0,
  laporanAwalRejected: 0,
  laporanAkhirRejected: 0,
  teams_teams_leaderIdTousers: 0,
};

describe('Security — deleteUser scope & target boundaries', () => {
  it('1. ADMIN cannot delete a user in another RTUPP (403, no delete)', async () => {
    anyPrisma.user.findUnique.mockResolvedValue({
      id: 't1',
      role: 'PETUGAS',
      rtuppId: 'rtupp-B',
      _count: zeroCounts,
    });
    const res = mockResponse();
    await deleteUser(
      reqWith({ userId: 'a1', role: 'ADMIN', rtuppId: 'rtupp-A' }, { id: 't1' }),
      res
    );
    expect(res._status).toBe(403);
    expect(anyPrisma.user.delete).not.toHaveBeenCalled();
  });

  it('2. ADMIN can delete a PETUGAS in its OWN RTUPP (success)', async () => {
    anyPrisma.user.findUnique.mockResolvedValue({
      id: 't1',
      role: 'PETUGAS',
      rtuppId: 'rtupp-A',
      email: 't@pln.co.id',
      name: 'T',
      _count: zeroCounts,
    });
    anyPrisma.user.delete.mockResolvedValue({ id: 't1' });
    const res = mockResponse();
    await deleteUser(
      reqWith({ userId: 'a1', role: 'ADMIN', rtuppId: 'rtupp-A' }, { id: 't1' }),
      res
    );
    expect(res._status).toBe(200);
    expect(anyPrisma.user.delete).toHaveBeenCalledOnce();
  });

  it('3. MANAGER cannot delete a MANAGER account (403)', async () => {
    anyPrisma.user.findUnique.mockResolvedValue({
      id: 't1',
      role: 'MANAGER',
      rtuppId: null,
      _count: zeroCounts,
    });
    const res = mockResponse();
    await deleteUser(reqWith({ userId: 'm1', role: 'MANAGER' }, { id: 't1' }), res);
    expect(res._status).toBe(403);
    expect(anyPrisma.user.delete).not.toHaveBeenCalled();
  });

  it('4. MANAGER cannot delete a MASTER account (403)', async () => {
    anyPrisma.user.findUnique.mockResolvedValue({
      id: 't1',
      role: 'MASTER',
      rtuppId: null,
      _count: zeroCounts,
    });
    const res = mockResponse();
    await deleteUser(reqWith({ userId: 'm1', role: 'MANAGER' }, { id: 't1' }), res);
    // canManageUsers rejects the read-only MANAGER up front (403); the dedicated
    // 400 MASTER-protection still guards MASTER-deletes-MASTER elsewhere.
    expect(res._status).toBe(403);
    expect(anyPrisma.user.delete).not.toHaveBeenCalled();
  });

  it('5. MANAGER cannot delete an ADMIN — read-only role, no user writes (403)', async () => {
    anyPrisma.user.findUnique.mockResolvedValue({
      id: 't1',
      role: 'ADMIN',
      rtuppId: 'rtupp-B',
      email: 'a@pln.co.id',
      name: 'A',
      _count: zeroCounts,
    });
    anyPrisma.user.delete.mockResolvedValue({ id: 't1' });
    const res = mockResponse();
    // MANAGER is read-only: canManageUsers rejects it up front, before any target
    // or RTUPP consideration.
    await deleteUser(reqWith({ userId: 'm1', role: 'MANAGER' }, { id: 't1' }), res);
    expect(res._status).toBe(403);
    expect(anyPrisma.user.delete).not.toHaveBeenCalled();
  });
});

describe('Security — createUser / updateUser boundaries', () => {
  it('6. MANAGER cannot create a MANAGER account (403)', async () => {
    const res = mockResponse();
    await createUser(
      reqWith({ userId: 'm1', role: 'MANAGER' }, {}, {
        email: 'x@pln.co.id',
        password: 'secret1',
        name: 'X',
        role: 'MANAGER',
      }),
      res
    );
    expect(res._status).toBe(403);
    expect(anyPrisma.user.create).not.toHaveBeenCalled();
  });

  it('7. ADMIN cannot reassign a user to another RTUPP (403, no update)', async () => {
    anyPrisma.user.findUnique.mockResolvedValue({
      id: 't1',
      role: 'PETUGAS',
      rtuppId: 'rtupp-A',
      rtupp: { name: 'RTUPP 1' },
    });
    const res = mockResponse();
    await updateUser(
      reqWith(
        { userId: 'a1', role: 'ADMIN', rtuppId: 'rtupp-A' },
        { id: 't1' },
        { name: 'T', rtuppName: 'RTUPP 3' }
      ),
      res
    );
    expect(res._status).toBe(403);
    expect(anyPrisma.user.update).not.toHaveBeenCalled();
  });
});

describe('Security — ADMIN role-boundary restrictions', () => {
  it('8. ADMIN cannot create an ADMIN account (403)', async () => {
    const res = mockResponse();
    await createUser(
      reqWith({ userId: 'a1', role: 'ADMIN', rtuppId: 'rtupp-A' }, {}, {
        email: 'newadmin@pln.co.id',
        password: 'secret1',
        name: 'New Admin',
        role: 'ADMIN',
      }),
      res
    );
    expect(res._status).toBe(403);
    expect(anyPrisma.user.create).not.toHaveBeenCalled();
  });

  it('9. ADMIN can create a PETUGAS account in its own RTUPP (success)', async () => {
    const validRtuppId = 'e2b34a66-7b24-4fbb-a15d-3d231b53e7f6';
    const validTeamId = 'f3a45c77-8c35-4ecc-b26e-4e342c64f8f7';
    anyPrisma.rtupp.findUnique.mockResolvedValue({ id: validRtuppId, name: 'RTUPP A' });
    anyPrisma.team.findUnique.mockResolvedValue({ id: validTeamId, rtuppId: validRtuppId });
    anyPrisma.user.create.mockResolvedValue({ id: 'p2' });
    const res = mockResponse();
    await createUser(
      reqWith({ userId: 'a1', role: 'ADMIN', rtuppId: validRtuppId }, {}, {
        email: 'newpetugas@pln.co.id',
        password: 'secret1',
        name: 'New Petugas',
        role: 'PETUGAS',
        rtuppId: validRtuppId,
        teamId: validTeamId,
      }),
      res
    );
    expect(res._status).toBe(200);
    expect(anyPrisma.user.create).toHaveBeenCalledOnce();
  });

  it('10. ADMIN cannot update an ADMIN account (403)', async () => {
    anyPrisma.user.findUnique.mockResolvedValue({
      id: 'target-admin',
      role: 'ADMIN',
      rtuppId: 'rtupp-A',
    });
    const res = mockResponse();
    await updateUser(
      reqWith({ userId: 'a1', role: 'ADMIN', rtuppId: 'rtupp-A' }, { id: 'target-admin' }, { name: 'Changed Name' }),
      res
    );
    expect(res._status).toBe(403);
    expect(anyPrisma.user.update).not.toHaveBeenCalled();
  });

  it('11. ADMIN cannot reset an ADMIN account password (403)', async () => {
    anyPrisma.user.findUnique.mockResolvedValue({
      id: 'target-admin',
      role: 'ADMIN',
      rtuppId: 'rtupp-A',
    });
    const res = mockResponse();
    await resetPassword(
      reqWith({ userId: 'a1', role: 'ADMIN', rtuppId: 'rtupp-A' }, { id: 'target-admin' }, { password: 'newpassword1' }),
      res
    );
    expect(res._status).toBe(403);
    expect(anyPrisma.user.update).not.toHaveBeenCalled();
  });

  it('12. ADMIN cannot delete an ADMIN account (403)', async () => {
    anyPrisma.user.findUnique.mockResolvedValue({
      id: 'target-admin',
      role: 'ADMIN',
      rtuppId: 'rtupp-A',
    });
    const res = mockResponse();
    await deleteUser(
      reqWith({ userId: 'a1', role: 'ADMIN', rtuppId: 'rtupp-A' }, { id: 'target-admin' }),
      res
    );
    expect(res._status).toBe(403);
    expect(anyPrisma.user.delete).not.toHaveBeenCalled();
  });
});
