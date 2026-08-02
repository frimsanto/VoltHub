import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the Prisma client (manual mock in src/config/__mocks__/database.ts)
vi.mock('../config/database');

import prisma, { resetPrismaMock } from '../config/database';
import { generateRefreshToken } from '../utils/jwt';
import {
  issueSession,
  rotateRefreshToken,
  revokeSession,
  revokeAllForUser,
  RefreshTokenError,
} from './refreshTokenService';

const anyPrisma = prisma as any;

const user = { id: 'user-1', email: 'p@pln.id', role: 'PETUGAS', name: 'Petugas' };

/** Build a valid refresh JWT carrying a family id, as the store would issue. */
const tokenForFamily = (sid: string) =>
  generateRefreshToken(
    { userId: user.id, email: user.email, role: user.role, name: user.name },
    { jti: 'jti-old', sid }
  );

beforeEach(() => {
  resetPrismaMock();
  vi.clearAllMocks();
});

describe('issueSession', () => {
  it('mints an access + refresh pair and persists the hashed token', async () => {
    anyPrisma.refreshToken.create.mockResolvedValue({});

    const tokens = await issueSession(user, { userAgent: 'jest', ipAddress: '127.0.0.1' });

    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toBeTruthy();
    expect(anyPrisma.refreshToken.create).toHaveBeenCalledTimes(1);
    const arg = anyPrisma.refreshToken.create.mock.calls[0][0].data;
    expect(arg.userId).toBe(user.id);
    expect(arg.tokenHash).toHaveLength(64); // sha256 hex
    expect(arg.familyId).toBeTruthy();
    expect(arg.expiresAt instanceof Date).toBe(true);
  });
});

describe('rotateRefreshToken', () => {
  it('rotates a valid token: revokes the old, issues a new pair', async () => {
    const token = tokenForFamily('fam-1');
    anyPrisma.refreshToken.findUnique.mockResolvedValue({
      id: 'jti-old',
      userId: user.id,
      familyId: 'fam-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    anyPrisma.$transaction.mockResolvedValue([]);

    const tokens = await rotateRefreshToken(token, {});

    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toBeTruthy();
    expect(tokens.refreshToken).not.toBe(token); // rotated
    expect(anyPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('rejects garbage and never touches the store', async () => {
    await expect(rotateRefreshToken('not-a-jwt', {})).rejects.toBeInstanceOf(RefreshTokenError);
    expect(anyPrisma.refreshToken.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a valid-but-unknown token and revokes its family (reuse defence)', async () => {
    const token = tokenForFamily('fam-2');
    anyPrisma.refreshToken.findUnique.mockResolvedValue(null);

    await expect(rotateRefreshToken(token, {})).rejects.toBeInstanceOf(RefreshTokenError);
    expect(anyPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ familyId: 'fam-2' }) })
    );
  });

  it('treats reuse of an already-revoked token as compromise → revokes family', async () => {
    const token = tokenForFamily('fam-3');
    anyPrisma.refreshToken.findUnique.mockResolvedValue({
      id: 'jti-old',
      userId: user.id,
      familyId: 'fam-3',
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(rotateRefreshToken(token, {})).rejects.toBeInstanceOf(RefreshTokenError);
    expect(anyPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ familyId: 'fam-3' }) })
    );
    expect(anyPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an expired token', async () => {
    const token = tokenForFamily('fam-4');
    anyPrisma.refreshToken.findUnique.mockResolvedValue({
      id: 'jti-old',
      userId: user.id,
      familyId: 'fam-4',
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(rotateRefreshToken(token, {})).rejects.toBeInstanceOf(RefreshTokenError);
    expect(anyPrisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('revokeSession', () => {
  it('revokes the family of a known token', async () => {
    const token = tokenForFamily('fam-5');
    anyPrisma.refreshToken.findUnique.mockResolvedValue({ id: 'x', familyId: 'fam-5' });
    anyPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

    await expect(revokeSession(token)).resolves.toBe(true);
    expect(anyPrisma.refreshToken.updateMany).toHaveBeenCalled();
  });

  it('returns false for an absent token', async () => {
    await expect(revokeSession(undefined)).resolves.toBe(false);
    expect(anyPrisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });
});

describe('revokeAllForUser', () => {
  it('revokes every family for the user and returns the count', async () => {
    anyPrisma.refreshToken.updateMany.mockResolvedValue({ count: 3 });
    await expect(revokeAllForUser(user.id)).resolves.toBe(3);
    expect(anyPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: user.id, revokedAt: null } })
    );
  });
});
