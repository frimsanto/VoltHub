import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  name: string;
  // Tenant claim (ADDITIVE / optional). Lets scoped requests resolve the RTUPP
  // boundary without a per-request DB lookup. Optional for backward compat:
  // tokens minted before this field carry no claim, so the tenant-scope helper
  // falls back to a DB lookup of the user's rtuppId when it is absent.
  rtuppId?: string | null;
}

// Refresh tokens additionally carry a unique token id (`jti`) and a session/
// family id (`sid`) so the server-side store can revoke and rotate them.
export interface RefreshClaims {
  jti?: string;
  sid?: string;
}

export type RefreshTokenPayload = TokenPayload &
  RefreshClaims & { iat?: number; exp?: number };

// Pin the signing/verification algorithm. The secrets are symmetric (HMAC), so
// we lock everything to HS256: verification then refuses tokens that declare any
// other `alg` (including the dangerous `none`), closing algorithm-confusion /
// downgrade attacks regardless of what an attacker puts in the JWT header.
const JWT_ALG = 'HS256' as const;

export const generateAccessToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
    algorithm: JWT_ALG,
  } as SignOptions);
};

export const generateRefreshToken = (
  payload: TokenPayload,
  claims: RefreshClaims = {}
): string => {
  const body = {
    ...payload,
    ...(claims.jti ? { jti: claims.jti } : {}),
    ...(claims.sid ? { sid: claims.sid } : {}),
  };
  return jwt.sign(body, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
    algorithm: JWT_ALG,
  } as SignOptions);
};

export const verifyAccessToken = (token: string): TokenPayload => {
  return jwt.verify(token, env.JWT_SECRET, { algorithms: [JWT_ALG] }) as TokenPayload;
};

export const verifyRefreshToken = (token: string): RefreshTokenPayload => {
  return jwt.verify(token, env.JWT_REFRESH_SECRET, {
    algorithms: [JWT_ALG],
  }) as RefreshTokenPayload;
};
