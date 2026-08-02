import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  TokenPayload,
} from './jwt';

const payload: TokenPayload = {
  userId: 'user-1',
  email: 'petugas@pln.co.id',
  role: 'PETUGAS',
  name: 'Petugas Satu',
};

describe('jwt utils', () => {
  it('round-trips an access token', () => {
    const token = generateAccessToken(payload);
    const decoded = verifyAccessToken(token);
    expect(decoded.userId).toBe(payload.userId);
    expect(decoded.email).toBe(payload.email);
    expect(decoded.role).toBe(payload.role);
  });

  it('round-trips a refresh token', () => {
    const token = generateRefreshToken(payload);
    const decoded = verifyRefreshToken(token);
    expect(decoded.userId).toBe(payload.userId);
  });

  it('access and refresh tokens are signed with different secrets', () => {
    const access = generateAccessToken(payload);
    // Verifying an access token with the refresh secret must fail.
    expect(() => verifyRefreshToken(access)).toThrow();
  });

  it('rejects a tampered/invalid token', () => {
    expect(() => verifyAccessToken('not.a.jwt')).toThrow();
  });

  it('rejects an expired token', () => {
    const expired = jwt.sign(payload, process.env.JWT_SECRET as string, {
      expiresIn: '-1s',
    });
    expect(() => verifyAccessToken(expired)).toThrow(/jwt expired/i);
  });
});
