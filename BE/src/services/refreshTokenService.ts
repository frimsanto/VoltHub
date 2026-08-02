import crypto from 'crypto';
import prisma from '../config/database';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  type TokenPayload,
} from '../utils/jwt';

/**
 * Refresh-token revocation + rotation.
 *
 * Every login opens a "family" (session): one row in `refresh_tokens` keyed by
 * the SHA-256 hash of the issued JWT (the raw token is never persisted). Each
 * refresh rotates the token — the old row is revoked and a new one created in
 * the same family. Presenting an already-rotated (revoked) or unknown-but-valid
 * token is treated as reuse/theft and revokes the whole family.
 *
 * Public surface:
 *   issueSession        — login: mint access+refresh, open a family
 *   rotateRefreshToken  — refresh: validate + rotate, return new access+refresh
 *   revokeSession       — logout (single device): revoke the presented token's family
 *   revokeAllForUser    — logout all devices / compromise: revoke every family
 */

export interface SessionContext {
  userAgent?: string | null;
  ipAddress?: string | null;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
}

/** Raised on any invalid/expired/revoked refresh token. Maps to HTTP 401. */
export class RefreshTokenError extends Error {
  constructor(message = 'Invalid refresh token') {
    super(message);
    this.name = 'RefreshTokenError';
  }
}

const sha256 = (value: string): string =>
  crypto.createHash('sha256').update(value).digest('hex');

const toPayload = (p: {
  userId: string;
  email: string;
  role: string;
  name: string;
  rtuppId?: string | null;
}): TokenPayload => ({
  userId: p.userId,
  email: p.email,
  role: p.role,
  name: p.name,
  // Only include the claim when known; older refresh tokens carry no rtuppId and
  // the scope helper falls back to a DB lookup when it is absent.
  ...(p.rtuppId !== undefined ? { rtuppId: p.rtuppId } : {}),
});

/** Persist a freshly minted refresh token and return access + refresh tokens. */
async function persistToken(
  payload: TokenPayload,
  familyId: string,
  ctx: SessionContext
): Promise<IssuedTokens> {
  const jti = crypto.randomUUID();
  const refreshToken = generateRefreshToken(payload, { jti, sid: familyId });
  const decoded = verifyRefreshToken(refreshToken); // read the `exp` claim
  const expiresAt = new Date((decoded.exp ?? 0) * 1000);

  await prisma.refreshToken.create({
    data: {
      id: jti,
      userId: payload.userId,
      tokenHash: sha256(refreshToken),
      familyId,
      expiresAt,
      userAgent: ctx.userAgent ?? null,
      ipAddress: ctx.ipAddress ?? null,
    },
  });

  return { accessToken: generateAccessToken(payload), refreshToken };
}

/** Login: open a new session/family and issue the first token pair. */
export async function issueSession(
  user: { id: string; email: string; role: string; name: string; rtuppId?: string | null },
  ctx: SessionContext = {}
): Promise<IssuedTokens> {
  const payload = toPayload({
    userId: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    rtuppId: user.rtuppId ?? null,
  });
  const familyId = crypto.randomUUID();
  return persistToken(payload, familyId, ctx);
}

/** Revoke every non-revoked token in a family (idempotent). */
async function revokeFamily(familyId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Refresh: validate the presented refresh token, rotate it, and return a new
 * access + refresh pair. Throws RefreshTokenError on any failure.
 */
export async function rotateRefreshToken(
  token: string,
  ctx: SessionContext = {}
): Promise<IssuedTokens> {
  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw new RefreshTokenError();
  }

  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash: sha256(token) },
  });

  // Valid signature but not in the store: either rotated-away (and pruned) or a
  // pre-revocation token. If it still names a family, revoke that family.
  if (!record) {
    if (payload.sid) await revokeFamily(payload.sid);
    throw new RefreshTokenError();
  }

  // Reuse of an already-rotated token → likely theft → revoke the whole family.
  if (record.revokedAt) {
    await revokeFamily(record.familyId);
    throw new RefreshTokenError();
  }

  if (record.expiresAt.getTime() <= Date.now()) {
    throw new RefreshTokenError('Refresh token expired');
  }

  const nextPayload = toPayload(payload);
  const jti = crypto.randomUUID();
  const newRefresh = generateRefreshToken(nextPayload, {
    jti,
    sid: record.familyId,
  });
  const decoded = verifyRefreshToken(newRefresh);
  const expiresAt = new Date((decoded.exp ?? 0) * 1000);

  // Atomically retire the old token and store its replacement.
  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date(), replacedById: jti },
    }),
    prisma.refreshToken.create({
      data: {
        id: jti,
        userId: record.userId,
        tokenHash: sha256(newRefresh),
        familyId: record.familyId,
        expiresAt,
        userAgent: ctx.userAgent ?? null,
        ipAddress: ctx.ipAddress ?? null,
      },
    }),
  ]);

  return { accessToken: generateAccessToken(nextPayload), refreshToken: newRefresh };
}

/**
 * Logout (single device): revoke the family of the presented refresh token.
 * Best-effort — a malformed/unknown token is silently ignored (the client is
 * discarding it anyway). Returns true if a family was found and revoked.
 */
export async function revokeSession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash: sha256(token) },
  });
  if (!record) {
    // Fall back to the token's own `sid` claim if it parses.
    try {
      const payload = verifyRefreshToken(token);
      if (payload.sid) {
        await revokeFamily(payload.sid);
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  }
  await revokeFamily(record.familyId);
  return true;
}

/** Logout all devices / revoke a compromised account: revoke every family. */
export async function revokeAllForUser(userId: string): Promise<number> {
  const result = await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}
