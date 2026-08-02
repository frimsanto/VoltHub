import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import prisma from '../config/database';
import { successResponse, errorResponse, validationErrorResponse } from '../utils/response';
import { AuthRequest } from '../middlewares/auth';
import { recordAudit } from '../utils/audit';
import {
  getLockStatus,
  recordFailedAttempt,
  clearAttempts,
} from '../services/loginLockout';
import {
  issueSession,
  rotateRefreshToken,
  revokeSession,
  revokeAllForUser,
  RefreshTokenError,
  type SessionContext,
} from '../services/refreshTokenService';
import { z } from 'zod';

/** Pull the request's user-agent / client IP for the session audit columns. */
const sessionContext = (req: Request): SessionContext => ({
  userAgent: req.headers?.['user-agent'] ?? null,
  ipAddress: req.ip ?? null,
});

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const validation = loginSchema.safeParse(req.body);
    
    if (!validation.success) {
      validationErrorResponse(res, validation.error.format());
      return;
    }

    const { email, password } = validation.data;

    // Brute-force lockout: refuse early if this account is currently locked
    // (5 failed attempts -> 15 min lock). Checked before hitting the DB/bcrypt.
    const lock = getLockStatus(email);
    if (lock.locked) {
      const minutes = Math.ceil(lock.retryAfterMs / 60000);
      res.setHeader('Retry-After', String(Math.ceil(lock.retryAfterMs / 1000)));
      errorResponse(
        res,
        `Account temporarily locked due to too many failed attempts. Try again in ${minutes} minute(s).`,
        429
      );
      return;
    }

    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' as const } },
      include: { rtupp: true, team: true },
    });

    if (!user) {
      // Count failures for unknown emails too, so attackers can't probe which
      // accounts exist by hammering one address without consequence.
      recordFailedAttempt(email);
      // NOTE: ActivityLog.userId is a required FK, so login attempts for an
      // unknown email cannot be persisted to the audit trail (no user to link).
      errorResponse(res, 'Invalid credentials', 401);
      return;
    }

    if (!user.isActive) {
      await recordAudit({
        userId: user.id,
        action: 'LOGIN',
        entityType: 'USER',
        entityId: user.id,
        details: { success: false, reason: 'ACCOUNT_DEACTIVATED', email },
      });
      errorResponse(res, 'Account is deactivated', 403);
      return;
    }

    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      const result = recordFailedAttempt(email);
      await recordAudit({
        userId: user.id,
        action: 'LOGIN',
        entityType: 'USER',
        entityId: user.id,
        details: {
          success: false,
          reason: 'INVALID_PASSWORD',
          email,
          locked: result.locked,
          attemptsRemaining: result.attemptsRemaining,
        },
      });
      if (result.locked) {
        const minutes = Math.ceil(result.retryAfterMs / 60000);
        res.setHeader('Retry-After', String(Math.ceil(result.retryAfterMs / 1000)));
        errorResponse(
          res,
          `Account temporarily locked due to too many failed attempts. Try again in ${minutes} minute(s).`,
          429
        );
        return;
      }
      errorResponse(res, 'Invalid credentials', 401);
      return;
    }

    // Successful password check — clear any accumulated failure counter.
    clearAttempts(email);

    // Open a new server-side session (family) and mint the token pair. The
    // refresh token is now revocable + rotated on use.
    const { accessToken, refreshToken } = await issueSession(
      {
        id: user.id,
        email: user.email,
        role: user.role ?? '',
        name: user.name,
        rtuppId: user.rtuppId ?? null,
      },
      sessionContext(req)
    );

    await recordAudit({
      userId: user.id,
      action: 'LOGIN',
      entityType: 'USER',
      entityId: user.id,
      details: { success: true, email: user.email, role: user.role },
    });

    successResponse(
      res,
      {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          phone: user.phone,
          avatar: user.avatar,
          isActive: user.isActive,
          mustChangePassword: user.mustChangePassword ?? false,
          rtupp: user.rtupp,
          team: user.team,
        },
        tokens: {
          accessToken,
          refreshToken,
        },
      },
      'Login successful'
    );
  } catch (error) {
    console.error('Login error:', error);
    errorResponse(res, 'Login failed', 500);
  }
};

export const refreshToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      errorResponse(res, 'Refresh token required', 401);
      return;
    }

    // Validate against the server-side store and rotate: the old refresh token
    // is revoked and a new pair issued. Reuse of a rotated token revokes the
    // whole session family.
    const tokens = await rotateRefreshToken(refreshToken, sessionContext(req));

    successResponse(res, tokens, 'Token refreshed successfully');
  } catch (error) {
    if (error instanceof RefreshTokenError) {
      errorResponse(res, 'Invalid refresh token', 401);
      return;
    }
    console.error('Refresh token error:', error);
    errorResponse(res, 'Invalid refresh token', 401);
  }
};

export const logout = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      errorResponse(res, 'User not authenticated', 401);
      return;
    }

    // Single-device logout: revoke the session/family of the presented refresh
    // token so it can no longer be rotated. The access token expires on its own.
    const revoked = await revokeSession(req.body?.refreshToken);

    await recordAudit({
      userId,
      action: 'LOGOUT',
      entityType: 'USER',
      entityId: userId,
      details: { success: true, scope: 'single', sessionRevoked: revoked },
    });

    successResponse(res, null, 'Logout successful');
  } catch (error) {
    console.error('Logout error:', error);
    errorResponse(res, 'Logout failed', 500);
  }
};

/**
 * Logout from every device: revoke all of the user's refresh-token families.
 * Use after a password change or when a session is suspected compromised.
 */
export const logoutAll = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      errorResponse(res, 'User not authenticated', 401);
      return;
    }

    const count = await revokeAllForUser(userId);

    await recordAudit({
      userId,
      action: 'LOGOUT',
      entityType: 'USER',
      entityId: userId,
      details: { success: true, scope: 'all', sessionsRevoked: count },
    });

    successResponse(res, { sessionsRevoked: count }, 'Logged out from all devices');
  } catch (error) {
    console.error('Logout-all error:', error);
    errorResponse(res, 'Logout failed', 500);
  }
};

export const getProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      errorResponse(res, 'User not authenticated', 401);
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        avatar: true,
        isActive: true,
        mustChangePassword: true,
        createdAt: true,
        rtupp: true,
        team: true,
      },
    });

    if (!user) {
      errorResponse(res, 'User not found', 404);
      return;
    }

    // Live profile stats (shown on the Profile page).
    const [reportAwal, reportAkhir, lastLogin, activeSessions] = await Promise.all([
      prisma.laporanAwal.count({ where: { createdById: userId } }),
      prisma.laporanAkhir.count({ where: { createdById: userId } }),
      // Most recent successful login from the audit trail (the current session).
      prisma.activityLog.findFirst({
        where: { userId, action: 'LOGIN' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      // Count of live (non-revoked, non-expired) refresh sessions for this user.
      prisma.refreshToken.count({
        where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      }),
    ]);

    successResponse(
      res,
      {
        ...user,
        reportCount: reportAwal + reportAkhir,
        lastLoginAt: lastLogin?.createdAt ?? null,
        activeSessions,
      },
      'Profile retrieved successfully'
    );
  } catch (error) {
    console.error('Get profile error:', error);
    errorResponse(res, 'Failed to retrieve profile', 500);
  }
};

const updateProfileSchema = z.object({
  email: z.string().email('Format email tidak valid').optional(),
  phone: z
    .string()
    .max(50)
    .regex(/^[0-9+\-\s()]*$/, 'Nomor HP tidak valid')
    .optional()
    .or(z.literal('')),
});

/**
 * Self-service profile update. A user may change only their own email and phone
 * — name, role, RTUPP and team are managed by admins and stay read-only here.
 */
export const updateProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      errorResponse(res, 'User not authenticated', 401);
      return;
    }

    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      validationErrorResponse(res, parsed.error.format());
      return;
    }
    const { email, phone } = parsed.data;

    // Enforce email uniqueness across other accounts.
    if (email) {
      const existing = await prisma.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' as const } },
      });
      if (existing && existing.id !== userId) {
        errorResponse(res, 'Email sudah digunakan akun lain', 409);
        return;
      }
    }

    const data: { email?: string; phone?: string | null } = {};
    if (email !== undefined) data.email = email;
    if (phone !== undefined) data.phone = phone === '' ? null : phone;

    if (Object.keys(data).length === 0) {
      errorResponse(res, 'Tidak ada perubahan', 400);
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: userId },
        data,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          phone: true,
          avatar: true,
          isActive: true,
          mustChangePassword: true,
          createdAt: true,
          rtupp: true,
          team: true,
        },
      });
      await recordAudit(
        {
          userId,
          action: 'UPDATE',
          entityType: 'USER',
          entityId: userId,
          details: { profileUpdated: Object.keys(data) },
        },
        tx
      );
      return u;
    });

    successResponse(res, updated, 'Profil berhasil diperbarui');
  } catch (error) {
    console.error('Update profile error:', error);
    errorResponse(res, 'Gagal memperbarui profil', 500);
  }
};

/**
 * Upload / replace the current user's avatar. Multer (uploadAvatar) has already
 * validated and stored the raster image under uploads/avatars/. We persist the
 * inline URL path and clean up the previous avatar file.
 */
export const uploadAvatarHandler = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      errorResponse(res, 'User not authenticated', 401);
      return;
    }
    if (!req.file) {
      errorResponse(res, 'File foto wajib diunggah', 400);
      return;
    }

    const avatarPath = `/uploads/avatars/${req.file.filename}`;

    // Remove the previous avatar file (best-effort) so old uploads don't pile up.
    const previous = await prisma.user.findUnique({
      where: { id: userId },
      select: { avatar: true },
    });
    if (previous?.avatar && previous.avatar.startsWith('/uploads/avatars/')) {
      const oldPath = path.join(process.cwd(), previous.avatar.replace(/^\//, ''));
      fs.promises.unlink(oldPath).catch(() => {
        /* file may already be gone — ignore */
      });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { avatar: avatarPath },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        avatar: true,
        isActive: true,
        mustChangePassword: true,
        createdAt: true,
        rtupp: true,
        team: true,
      },
    });

    successResponse(res, updated, 'Foto profil berhasil diperbarui');
  } catch (error) {
    console.error('Upload avatar error:', error);
    errorResponse(res, 'Gagal mengunggah foto profil', 500);
  }
};

export const changePassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      errorResponse(res, 'User not authenticated', 401);
      return;
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      validationErrorResponse(res, { password: 'Current and new password are required' });
      return;
    }

    if (newPassword.length < 6) {
      validationErrorResponse(res, { newPassword: 'New password must be at least 6 characters' });
      return;
    }

    // bcrypt truncates beyond 72 bytes — reject longer input rather than hash a
    // silently-truncated password (avoids a false sense of strength).
    if (newPassword.length > 72) {
      validationErrorResponse(res, { newPassword: 'New password must be at most 72 characters' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      errorResponse(res, 'User not found', 404);
      return;
    }

    const isValidPassword = await bcrypt.compare(currentPassword, user.password);

    if (!isValidPassword) {
      errorResponse(res, 'Current password is incorrect', 400);
      return;
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Atomic: the password update and its audit record commit together.
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        // Clear the first-login flag so the user can access the app
        data: { password: hashedPassword, mustChangePassword: false },
      });

      await recordAudit(
        {
          userId,
          action: 'UPDATE',
          entityType: 'USER',
          entityId: userId,
          details: { passwordChanged: true },
        },
        tx
      );
    });

    // Changing the password invalidates every existing session: any token that
    // may have leaked with the old credentials is now dead. We revoke ALL of the
    // user's refresh-token families, then open a single fresh session for the
    // current device and hand the new pair back so this device stays logged in
    // seamlessly. Clients that ignore the returned tokens simply re-login on
    // their next refresh (backward compatible — the field is additive).
    await revokeAllForUser(userId);
    const tokens = await issueSession(
      {
        id: user.id,
        email: user.email,
        role: user.role ?? '',
        name: user.name,
        rtuppId: user.rtuppId ?? null,
      },
      sessionContext(req)
    );

    successResponse(
      res,
      { mustChangePassword: false, tokens },
      'Password changed successfully'
    );
  } catch (error) {
    console.error('Change password error:', error);
    errorResponse(res, 'Failed to change password', 500);
  }
};
