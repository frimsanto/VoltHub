import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middlewares/auth';
import { successResponse, errorResponse, validationErrorResponse } from '../utils/response';
import { z } from 'zod';

const createTeamSchema = z.object({
  code: z.string().min(1, 'Code is required').max(50),
  name: z.string().min(1, 'Name is required').max(255),
  rtuppId: z.string().uuid('Invalid RTUPP id'),
  leaderId: z.string().uuid('Invalid leader id').optional(),
  isActive: z.boolean().optional(),
});

const updateTeamSchema = z.object({
  code: z.string().min(1, 'Code is required').max(50).optional(),
  name: z.string().min(1, 'Name is required').max(255).optional(),
  rtuppId: z.string().uuid('Invalid RTUPP id').optional(),
  leaderId: z.string().uuid('Invalid leader id').nullable().optional(),
  isActive: z.boolean().optional(),
});

const teamInclude = {
  rtupp: { select: { id: true, name: true, code: true } },
  users_teams_leaderIdTousers: { select: { id: true, name: true, email: true } },
  _count: { select: { members: true } },
} as const;

// Get all Teams
export const getAllTeams = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { search, rtuppId, isActive } = req.query;

    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' as const } },
        { code: { contains: search as string, mode: 'insensitive' as const } },
      ];
    }
    if (rtuppId) where.rtuppId = rtuppId as string;
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const teams = await prisma.team.findMany({
      where,
      include: teamInclude,
      orderBy: { createdAt: 'desc' },
    });

    successResponse(res, teams, 'Team list retrieved successfully');
  } catch (error) {
    console.error('Get teams error:', error);
    errorResponse(res, 'Failed to retrieve teams', 500);
  }
};

// Create Team (SUPERADMIN only - enforced by route)
export const createTeam = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;

    const validation = createTeamSchema.safeParse(req.body);
    if (!validation.success) {
      validationErrorResponse(res, validation.error.format());
      return;
    }

    const { code, name, rtuppId, leaderId, isActive } = validation.data;

    const existing = await prisma.team.findUnique({ where: { code } });
    if (existing) {
      errorResponse(res, 'Team code already exists', 400);
      return;
    }

    const rtupp = await prisma.rTUPP.findUnique({ where: { id: rtuppId } });
    if (!rtupp) {
      errorResponse(res, 'RTUPP not found', 400);
      return;
    }

    if (leaderId) {
      const leader = await prisma.user.findUnique({ where: { id: leaderId } });
      if (!leader) {
        errorResponse(res, 'Leader (user) not found', 400);
        return;
      }
    }

    const team = await prisma.team.create({
      data: { code, name, rtuppId, leaderId: leaderId ?? null, isActive: isActive ?? true },
      include: teamInclude,
    });

    await prisma.activityLog.create({
      data: {
        userId: userId!,
        action: 'CREATE',
        entityType: 'TEAM',
        entityId: team.id,
        details: JSON.stringify({ code: team.code, name: team.name }),
      },
    });

    successResponse(res, team, 'Team created successfully');
  } catch (error) {
    console.error('Create team error:', error);
    errorResponse(res, 'Failed to create team', 500);
  }
};

// Update Team (SUPERADMIN only - enforced by route)
export const updateTeam = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;

    const validation = updateTeamSchema.safeParse(req.body);
    if (!validation.success) {
      validationErrorResponse(res, validation.error.format());
      return;
    }

    const data = validation.data;

    const existing = await prisma.team.findUnique({ where: { id } });
    if (!existing) {
      errorResponse(res, 'Team not found', 404);
      return;
    }

    if (data.code && data.code !== existing.code) {
      const dup = await prisma.team.findUnique({ where: { code: data.code } });
      if (dup) {
        errorResponse(res, 'Team code already exists', 400);
        return;
      }
    }

    if (data.rtuppId) {
      const rtupp = await prisma.rTUPP.findUnique({ where: { id: data.rtuppId } });
      if (!rtupp) {
        errorResponse(res, 'RTUPP not found', 400);
        return;
      }
    }

    if (data.leaderId) {
      const leader = await prisma.user.findUnique({ where: { id: data.leaderId } });
      if (!leader) {
        errorResponse(res, 'Leader (user) not found', 400);
        return;
      }
    }

    const team = await prisma.team.update({
      where: { id },
      data,
      include: teamInclude,
    });

    await prisma.activityLog.create({
      data: {
        userId: userId!,
        action: 'UPDATE',
        entityType: 'TEAM',
        entityId: id,
        details: JSON.stringify({ code: team.code, name: team.name }),
      },
    });

    successResponse(res, team, 'Team updated successfully');
  } catch (error) {
    console.error('Update team error:', error);
    errorResponse(res, 'Failed to update team', 500);
  }
};

// Delete Team (SUPERADMIN only - enforced by route)
export const deleteTeam = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;

    const existing = await prisma.team.findUnique({
      where: { id },
      include: { _count: { select: { members: true } } },
    });
    if (!existing) {
      errorResponse(res, 'Team not found', 404);
      return;
    }

    if (existing._count.members > 0) {
      errorResponse(
        res,
        `Team tidak dapat dihapus karena masih memiliki ${existing._count.members} anggota`,
        400
      );
      return;
    }

    await prisma.team.delete({ where: { id } });

    await prisma.activityLog.create({
      data: {
        userId: userId!,
        action: 'DELETE',
        entityType: 'TEAM',
        entityId: id,
        details: JSON.stringify({ code: existing.code, name: existing.name }),
      },
    });

    successResponse(res, null, 'Team deleted successfully');
  } catch (error) {
    console.error('Delete team error:', error);
    errorResponse(res, 'Failed to delete team', 500);
  }
};
