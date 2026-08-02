import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middlewares/auth';
import prisma from '../config/database';
import { successResponse, errorResponse, forbiddenResponse, validationErrorResponse } from '../utils/response';

const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  action: z
    .enum(['CREATE', 'UPDATE', 'DELETE', 'SUBMIT', 'VALIDATE', 'REJECT', 'EXPORT', 'LOGIN', 'LOGOUT', 'DOWNLOAD'])
    .optional(),
  entityType: z
    .enum(['USER', 'LAPORAN_AWAL', 'LAPORAN_AKHIR', 'RTUPP', 'TEAM', 'ATTACHMENT'])
    .optional(),
  userId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

/**
 * GET /api/audit — Audit Trail viewer.
 *
 * RBAC:
 *   MASTER / ADMIN (incl. legacy SUPERADMIN / ADMIN_RTUPP) -> all logs
 *   PETUGAS -> no access (403)
 */
export const getAuditLogs = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId || !userRole) {
      errorResponse(res, 'User not authenticated', 401);
      return;
    }

    if (userRole === 'PETUGAS') {
      forbiddenResponse(res, 'You do not have access to the audit trail');
      return;
    }

    const parsed = auditQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      validationErrorResponse(res, parsed.error.format());
      return;
    }

    const { page, limit, action, entityType, userId: filterUserId, startDate, endDate } = parsed.data;

    const where: Record<string, unknown> = {};

    // RBAC scoping: ADMIN reads globally (2026-07 policy) — same as
    // MASTER/legacy SUPERADMIN, no per-RTUPP restriction. PETUGAS is already
    // rejected above.

    if (action) where.action = action;
    if (entityType) where.entityType = entityType;
    if (filterUserId) where.userId = filterUserId;

    if (startDate || endDate) {
      const createdAt: Record<string, Date> = {};
      if (startDate) createdAt.gte = new Date(startDate);
      if (endDate) createdAt.lte = new Date(endDate + 'T23:59:59');
      where.createdAt = createdAt;
    }

    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              rtupp: { select: { id: true, code: true, name: true } },
            },
          },
        },
      }),
      prisma.activityLog.count({ where }),
    ]);

    // Parse the stored JSON `details` blob back into an object for the client.
    const items = logs.map((log) => ({
      ...log,
      details: parseDetails(log.details),
    }));

    successResponse(
      res,
      {
        items,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      'Audit logs retrieved successfully'
    );
  } catch (error) {
    console.error('Get audit logs error:', error);
    errorResponse(res, 'Failed to retrieve audit logs', 500);
  }
};

const parseDetails = (details: string | null): unknown => {
  if (!details) return null;
  try {
    return JSON.parse(details);
  } catch {
    return details;
  }
};
