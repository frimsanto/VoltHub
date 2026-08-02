import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middlewares/auth';
import { successResponse, errorResponse, validationErrorResponse } from '../utils/response';
import { z } from 'zod';

const createRtuppSchema = z.object({
  code: z.string().min(1, 'Code is required').max(50),
  name: z.string().min(1, 'Name is required').max(255),
  region: z.string().max(255).optional(),
  address: z.string().optional(),
  phone: z.string().max(50).optional(),
  isActive: z.boolean().optional(),
});

const updateRtuppSchema = z.object({
  code: z.string().min(1, 'Code is required').max(50).optional(),
  name: z.string().min(1, 'Name is required').max(255).optional(),
  region: z.string().max(255).optional(),
  address: z.string().optional(),
  phone: z.string().max(50).optional(),
  isActive: z.boolean().optional(),
});

// Get all RTUPP (with counts)
export const getAllRtupp = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { search, isActive } = req.query;

    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' as const } },
        { code: { contains: search as string, mode: 'insensitive' as const } },
        { region: { contains: search as string, mode: 'insensitive' as const } },
      ];
    }
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const rtupps = await prisma.rTUPP.findMany({
      where,
      include: {
        _count: { select: { teams: true, users: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    successResponse(res, rtupps, 'RTUPP list retrieved successfully');
  } catch (error) {
    console.error('Get RTUPP error:', error);
    errorResponse(res, 'Failed to retrieve RTUPP', 500);
  }
};

// Create RTUPP (SUPERADMIN only - enforced by route)
export const createRtupp = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;

    const validation = createRtuppSchema.safeParse(req.body);
    if (!validation.success) {
      validationErrorResponse(res, validation.error.format());
      return;
    }

    const { code, name, region, address, phone, isActive } = validation.data;

    const existing = await prisma.rTUPP.findUnique({ where: { code } });
    if (existing) {
      errorResponse(res, 'RTUPP code already exists', 400);
      return;
    }

    const rtupp = await prisma.rTUPP.create({
      data: { code, name, region, address, phone, isActive: isActive ?? true },
      include: { _count: { select: { teams: true, users: true } } },
    });

    await prisma.activityLog.create({
      data: {
        userId: userId!,
        action: 'CREATE',
        entityType: 'RTUPP',
        entityId: rtupp.id,
        details: JSON.stringify({ code: rtupp.code, name: rtupp.name }),
      },
    });

    successResponse(res, rtupp, 'RTUPP created successfully');
  } catch (error) {
    console.error('Create RTUPP error:', error);
    errorResponse(res, 'Failed to create RTUPP', 500);
  }
};

// Update RTUPP (SUPERADMIN only - enforced by route)
export const updateRtupp = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;

    const validation = updateRtuppSchema.safeParse(req.body);
    if (!validation.success) {
      validationErrorResponse(res, validation.error.format());
      return;
    }

    const data = validation.data;

    const existing = await prisma.rTUPP.findUnique({ where: { id } });
    if (!existing) {
      errorResponse(res, 'RTUPP not found', 404);
      return;
    }

    // Ensure code stays unique if changed
    if (data.code && data.code !== existing.code) {
      const dup = await prisma.rTUPP.findUnique({ where: { code: data.code } });
      if (dup) {
        errorResponse(res, 'RTUPP code already exists', 400);
        return;
      }
    }

    const rtupp = await prisma.rTUPP.update({
      where: { id },
      data,
      include: { _count: { select: { teams: true, users: true } } },
    });

    await prisma.activityLog.create({
      data: {
        userId: userId!,
        action: 'UPDATE',
        entityType: 'RTUPP',
        entityId: id,
        details: JSON.stringify({ code: rtupp.code, name: rtupp.name }),
      },
    });

    successResponse(res, rtupp, 'RTUPP updated successfully');
  } catch (error) {
    console.error('Update RTUPP error:', error);
    errorResponse(res, 'Failed to update RTUPP', 500);
  }
};

// Delete RTUPP (SUPERADMIN only - enforced by route)
export const deleteRtupp = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;

    const existing = await prisma.rTUPP.findUnique({
      where: { id },
      include: { _count: { select: { teams: true, users: true, personil: true } } },
    });
    if (!existing) {
      errorResponse(res, 'RTUPP not found', 404);
      return;
    }

    // Block deletion when still referenced (FK is Restrict on update; explicit guard for clarity)
    if (existing._count.teams > 0 || existing._count.users > 0 || existing._count.personil > 0) {
      errorResponse(
        res,
        `RTUPP tidak dapat dihapus karena masih digunakan oleh ${existing._count.teams} team, ${existing._count.users} user, dan ${existing._count.personil} personil`,
        400
      );
      return;
    }

    await prisma.rTUPP.delete({ where: { id } });

    await prisma.activityLog.create({
      data: {
        userId: userId!,
        action: 'DELETE',
        entityType: 'RTUPP',
        entityId: id,
        details: JSON.stringify({ code: existing.code, name: existing.name }),
      },
    });

    successResponse(res, null, 'RTUPP deleted successfully');
  } catch (error) {
    console.error('Delete RTUPP error:', error);
    errorResponse(res, 'Failed to delete RTUPP', 500);
  }
};
