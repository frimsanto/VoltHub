import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request } from 'express';
import { mockResponse } from '../__tests__/helpers/http';

// Mock the Prisma client (manual mock in src/config/__mocks__/database.ts)
vi.mock('../config/database');
// Audit writes hit the DB — stub them out for unit tests.
vi.mock('../utils/audit', () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));
// Control password verification deterministically (real Argon2id hashing is
// intentionally slow and has no place in a unit test).
vi.mock('../utils/password', () => ({
  verifyPassword: vi.fn(),
  hashPassword: vi.fn().mockResolvedValue('argon2-hash'),
  isLegacyHash: vi.fn().mockReturnValue(false),
}));

import prisma, { resetPrismaMock } from '../config/database';
import { verifyPassword, hashPassword } from '../utils/password';
import { login, refreshToken, logout, logoutAll } from './authController';
import { generateRefreshToken } from '../utils/jwt';
import { _resetLockoutStore } from '../services/loginLockout';
import type { AuthRequest } from '../middlewares/auth';

const anyPrisma = prisma as any;
const mockVerify = verifyPassword as unknown as ReturnType<typeof vi.fn>;
const mockHash = hashPassword as unknown as ReturnType<typeof vi.fn>;

/** Stub the password check: `valid` decides the outcome, `needsRehash` the upgrade path. */
const passwordCheck = (valid: boolean, needsRehash = false) =>
  mockVerify.mockResolvedValue({ valid, needsRehash });

const baseUser = {
  id: 'user-1',
  email: 'petugas@pln.co.id',
  name: 'Petugas Satu',
  role: 'PETUGAS',
  password: 'hashed-pw',
  phone: null,
  avatar: null,
  isActive: true,
  mustChangePassword: false,
  rtupp: null,
  team: null,
};

beforeEach(() => {
  resetPrismaMock();
  vi.clearAllMocks();
  _resetLockoutStore();
});

describe('login', () => {
  it('succeeds with valid credentials and returns tokens', async () => {
    anyPrisma.user.findFirst.mockResolvedValue(baseUser);
    passwordCheck(true);

    const req = { body: { email: baseUser.email, password: 'secret' } } as Request;
    const res = mockResponse();
    await login(req, res);

    expect(res._status).toBe(200);
    const body = res._json as any;
    expect(body.success).toBe(true);
    expect(body.data.tokens.accessToken).toBeTruthy();
    expect(body.data.tokens.refreshToken).toBeTruthy();
    expect(body.data.user.email).toBe(baseUser.email);
  });

  it('re-hashes a legacy bcrypt password to Argon2id on successful login', async () => {
    anyPrisma.user.findFirst.mockResolvedValue({ ...baseUser, password: '$2a$10$legacy' });
    passwordCheck(true, true);

    const req = { body: { email: baseUser.email, password: 'secret' } } as Request;
    const res = mockResponse();
    await login(req, res);

    expect(res._status).toBe(200);
    expect(mockHash).toHaveBeenCalledWith('secret');
    expect(anyPrisma.user.update).toHaveBeenCalledWith({
      where: { id: baseUser.id },
      data: { password: 'argon2-hash' },
    });
  });

  it('does not re-hash when the stored hash is already current', async () => {
    anyPrisma.user.findFirst.mockResolvedValue(baseUser);
    passwordCheck(true, false);

    const res = mockResponse();
    await login({ body: { email: baseUser.email, password: 'secret' } } as Request, res);

    expect(res._status).toBe(200);
    expect(anyPrisma.user.update).not.toHaveBeenCalled();
  });

  it('still logs the user in when the transparent re-hash write fails', async () => {
    anyPrisma.user.findFirst.mockResolvedValue({ ...baseUser, password: '$2a$10$legacy' });
    passwordCheck(true, true);
    anyPrisma.user.update.mockRejectedValue(new Error('db down'));

    const res = mockResponse();
    await login({ body: { email: baseUser.email, password: 'secret' } } as Request, res);

    expect(res._status).toBe(200);
  });

  it('fails (422) on invalid email format', async () => {
    const req = { body: { email: 'not-an-email', password: 'x' } } as Request;
    const res = mockResponse();
    await login(req, res);
    expect(res._status).toBe(422);
  });

  it('fails (401) when the user does not exist', async () => {
    anyPrisma.user.findFirst.mockResolvedValue(null);
    const req = { body: { email: 'ghost@pln.id', password: 'x' } } as Request;
    const res = mockResponse();
    await login(req, res);
    expect(res._status).toBe(401);
  });

  it('fails (401) on wrong password', async () => {
    anyPrisma.user.findFirst.mockResolvedValue(baseUser);
    passwordCheck(false);
    const req = { body: { email: baseUser.email, password: 'wrong' } } as Request;
    const res = mockResponse();
    await login(req, res);
    expect(res._status).toBe(401);
  });

  it('fails (403) when the account is deactivated', async () => {
    anyPrisma.user.findFirst.mockResolvedValue({ ...baseUser, isActive: false });
    const req = { body: { email: baseUser.email, password: 'secret' } } as Request;
    const res = mockResponse();
    await login(req, res);
    expect(res._status).toBe(403);
  });

  it('locks the account (429) after 5 failed password attempts', async () => {
    anyPrisma.user.findFirst.mockResolvedValue(baseUser);
    passwordCheck(false);

    // First 5 attempts return 401 (the 5th records the lock).
    for (let i = 0; i < 5; i++) {
      const res = mockResponse();
      await login({ body: { email: baseUser.email, password: 'x' } } as Request, res);
    }
    // 6th attempt is blocked early with 429 (no further hashing/DB work).
    const res = mockResponse();
    await login({ body: { email: baseUser.email, password: 'x' } } as Request, res);
    expect(res._status).toBe(429);
    expect(res._headers['Retry-After']).toBeTruthy();
  });

  it('a successful login clears the failure counter', async () => {
    anyPrisma.user.findFirst.mockResolvedValue(baseUser);

    // 3 failures, then a success.
    passwordCheck(false);
    for (let i = 0; i < 3; i++) {
      await login({ body: { email: baseUser.email, password: 'x' } } as Request, mockResponse());
    }
    passwordCheck(true);
    const ok = mockResponse();
    await login({ body: { email: baseUser.email, password: 'correct' } } as Request, ok);
    expect(ok._status).toBe(200);

    // Counter reset: 2 more failures must NOT lock (would need 5 fresh ones).
    passwordCheck(false);
    let last = mockResponse();
    for (let i = 0; i < 2; i++) {
      last = mockResponse();
      await login({ body: { email: baseUser.email, password: 'x' } } as Request, last);
    }
    expect(last._status).toBe(401);
  });
});

describe('refreshToken', () => {
  it('rotates a valid, store-backed refresh token and returns a new pair', async () => {
    const rt = generateRefreshToken(
      { userId: 'user-1', email: baseUser.email, role: 'PETUGAS', name: 'Petugas Satu' },
      { jti: 'jti-old', sid: 'fam-1' }
    );
    // The token must exist in the server-side store and be live.
    anyPrisma.refreshToken.findUnique.mockResolvedValue({
      id: 'jti-old',
      userId: 'user-1',
      familyId: 'fam-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    anyPrisma.$transaction.mockResolvedValue([]);

    const req = { body: { refreshToken: rt }, headers: {}, ip: '127.0.0.1' } as unknown as Request;
    const res = mockResponse();
    await refreshToken(req, res);
    expect(res._status).toBe(200);
    expect((res._json as any).data.accessToken).toBeTruthy();
    expect((res._json as any).data.refreshToken).toBeTruthy();
  });

  it('401 when no refresh token supplied', async () => {
    const req = { body: {}, headers: {} } as unknown as Request;
    const res = mockResponse();
    await refreshToken(req, res);
    expect(res._status).toBe(401);
  });

  it('401 on an invalid refresh token', async () => {
    const req = { body: { refreshToken: 'garbage' }, headers: {} } as unknown as Request;
    const res = mockResponse();
    await refreshToken(req, res);
    expect(res._status).toBe(401);
  });

  it('401 when the token is not in the store (revoked/unknown)', async () => {
    const rt = generateRefreshToken(
      { userId: 'user-1', email: baseUser.email, role: 'PETUGAS', name: 'Petugas Satu' },
      { jti: 'jti-x', sid: 'fam-x' }
    );
    anyPrisma.refreshToken.findUnique.mockResolvedValue(null);
    const req = { body: { refreshToken: rt }, headers: {} } as unknown as Request;
    const res = mockResponse();
    await refreshToken(req, res);
    expect(res._status).toBe(401);
  });
});

describe('logout', () => {
  it('records logout and revokes the session for an authenticated user', async () => {
    anyPrisma.refreshToken.findUnique.mockResolvedValue({ id: 'x', familyId: 'fam-1' });
    anyPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    const req = {
      user: { userId: 'user-1' },
      body: { refreshToken: 'whatever' },
    } as AuthRequest;
    const res = mockResponse();
    await logout(req, res);
    expect(res._status).toBe(200);
    expect((res._json as any).success).toBe(true);
  });

  it('401 when no authenticated user', async () => {
    const req = { body: {} } as AuthRequest;
    const res = mockResponse();
    await logout(req, res);
    expect(res._status).toBe(401);
  });
});

describe('logoutAll', () => {
  it('revokes every session for the user', async () => {
    anyPrisma.refreshToken.updateMany.mockResolvedValue({ count: 4 });
    const req = { user: { userId: 'user-1' } } as AuthRequest;
    const res = mockResponse();
    await logoutAll(req, res);
    expect(res._status).toBe(200);
    expect((res._json as any).data.sessionsRevoked).toBe(4);
  });

  it('401 when no authenticated user', async () => {
    const req = {} as AuthRequest;
    const res = mockResponse();
    await logoutAll(req, res);
    expect(res._status).toBe(401);
  });
});
