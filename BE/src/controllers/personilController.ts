import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middlewares/auth';
import { successResponse, errorResponse, validationErrorResponse, forbiddenResponse } from '../utils/response';
import { isMaster, isAdmin, isFieldOfficer } from '../auth/roles';
import { z } from 'zod';

const createPersonilSchema = z.object({
  nip: z.string().min(1, 'NIP is required').max(50),
  nama: z.string().min(1, 'Nama is required').max(255),
  jabatan: z.string().min(1, 'Jabatan is required').max(255),
  rtuppId: z.string().uuid('Invalid RTUPP id'),
  isActive: z.boolean().optional(),
});

const updatePersonilSchema = z.object({
  nip: z.string().min(1, 'NIP is required').max(50).optional(),
  nama: z.string().min(1, 'Nama is required').max(255).optional(),
  jabatan: z.string().min(1, 'Jabatan is required').max(255).optional(),
  rtuppId: z.string().uuid('Invalid RTUPP id').optional(),
  isActive: z.boolean().optional(),
});

// Resolve the RTUPP scope for ADMIN. Returns null when not assigned.
async function resolveAdminRtuppId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { rtuppId: true } });
  return user?.rtuppId ?? null;
}

// GET /api/personil  -- list with filtering (rtuppId, active only, search)
export const getAllPersonil = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { search, rtuppId, isActive } = req.query;

    const where: Record<string, unknown> = {};

    // Per-RTUPP scope: ADMIN and PETUGAS only see personil within their own
    // RTUPP (own rtuppId always wins over any rtuppId query param, so it can't
    // be bypassed). MASTER keeps the prior global view, optionally narrowed by
    // an explicit rtuppId param.
    if (isAdmin(req.user?.role) || isFieldOfficer(req.user?.role)) {
      const ownRtuppId = await resolveAdminRtuppId(req.user?.userId as string);
      if (!ownRtuppId) {
        errorResponse(res, 'Akun Anda belum terhubung ke RTUPP', 403);
        return;
      }
      where.rtuppId = ownRtuppId;
    } else if (rtuppId) {
      where.rtuppId = rtuppId as string;
    }

    if (search) {
      where.OR = [
        { nama: { contains: search as string, mode: 'insensitive' as const } },
        { nip: { contains: search as string, mode: 'insensitive' as const } },
        { jabatan: { contains: search as string, mode: 'insensitive' as const } },
      ];
    }
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const personil = await prisma.personil.findMany({
      where,
      include: { rtupp: { select: { id: true, code: true, name: true } } },
      orderBy: { nama: 'asc' },
    });

    successResponse(res, personil, 'Personil list retrieved successfully');
  } catch (error) {
    console.error('Get Personil error:', error);
    errorResponse(res, 'Failed to retrieve Personil', 500);
  }
};

// GET /api/personil/:id
export const getPersonilById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const personil = await prisma.personil.findUnique({
      where: { id },
      include: { rtupp: { select: { id: true, code: true, name: true } } },
    });

    if (!personil) {
      errorResponse(res, 'Personil not found', 404);
      return;
    }

    // Read is global for every allowed role (ADMIN included, 2026-07 policy);
    // per-RTUPP pinning remains on the write handlers below.
    successResponse(res, personil, 'Personil retrieved successfully');
  } catch (error) {
    console.error('Get Personil by id error:', error);
    errorResponse(res, 'Failed to retrieve Personil', 500);
  }
};

// POST /api/personil  -- SUPERADMIN / ADMIN_RTUPP only (enforced by route)
export const createPersonil = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId as string;

    const validation = createPersonilSchema.safeParse(req.body);
    if (!validation.success) {
      validationErrorResponse(res, validation.error.format());
      return;
    }

    const { nip, nama, jabatan, rtuppId, isActive } = validation.data;

    // Per-RTUPP scope: ADMIN may only create personil in their own RTUPP; MASTER any.
    if (!isMaster(req.user?.role)) {
      const adminRtuppId = await resolveAdminRtuppId(userId);
      if (!adminRtuppId) {
        errorResponse(res, 'ADMIN harus terdaftar di suatu RTUPP', 403);
        return;
      }
      if (rtuppId !== adminRtuppId) {
        forbiddenResponse(res, 'Hanya dapat menambah personil untuk RTUPP Anda');
        return;
      }
    }

    const rtupp = await prisma.rTUPP.findUnique({ where: { id: rtuppId } });
    if (!rtupp) {
      errorResponse(res, 'RTUPP not found', 400);
      return;
    }

    const existing = await prisma.personil.findUnique({ where: { nip } });
    if (existing) {
      errorResponse(res, 'NIP sudah terdaftar', 400);
      return;
    }

    const personil = await prisma.personil.create({
      data: { nip, nama, jabatan, rtuppId, isActive: isActive ?? true },
      include: { rtupp: { select: { id: true, code: true, name: true } } },
    });

    await prisma.activityLog.create({
      data: {
        userId,
        action: 'CREATE',
        entityType: 'USER',
        entityId: personil.id,
        details: JSON.stringify({ entity: 'PERSONIL', nip: personil.nip, nama: personil.nama }),
      },
    });

    successResponse(res, personil, 'Personil created successfully');
  } catch (error) {
    console.error('Create Personil error:', error);
    errorResponse(res, 'Failed to create Personil', 500);
  }
};

// PUT /api/personil/:id  -- SUPERADMIN / ADMIN_RTUPP only (enforced by route)
export const updatePersonil = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId as string;
    const { id } = req.params;

    const validation = updatePersonilSchema.safeParse(req.body);
    if (!validation.success) {
      validationErrorResponse(res, validation.error.format());
      return;
    }

    const data = validation.data;

    const existing = await prisma.personil.findUnique({ where: { id } });
    if (!existing) {
      errorResponse(res, 'Personil not found', 404);
      return;
    }

    // Per-RTUPP scope: ADMIN may only edit personil in their own RTUPP, and may
    // not move them to another RTUPP. MASTER may edit/move any.
    if (!isMaster(req.user?.role)) {
      const adminRtuppId = await resolveAdminRtuppId(userId);
      if (!adminRtuppId || existing.rtuppId !== adminRtuppId) {
        forbiddenResponse(res, 'Akses ditolak: personil di luar RTUPP Anda');
        return;
      }
      if (data.rtuppId && data.rtuppId !== adminRtuppId) {
        forbiddenResponse(res, 'Tidak dapat memindahkan personil ke RTUPP lain');
        return;
      }
    }

    if (data.rtuppId && data.rtuppId !== existing.rtuppId) {
      const rtupp = await prisma.rTUPP.findUnique({ where: { id: data.rtuppId } });
      if (!rtupp) {
        errorResponse(res, 'RTUPP not found', 400);
        return;
      }
    }

    if (data.nip && data.nip !== existing.nip) {
      const dup = await prisma.personil.findUnique({ where: { nip: data.nip } });
      if (dup) {
        errorResponse(res, 'NIP sudah terdaftar', 400);
        return;
      }
    }

    const personil = await prisma.personil.update({
      where: { id },
      data,
      include: { rtupp: { select: { id: true, code: true, name: true } } },
    });

    await prisma.activityLog.create({
      data: {
        userId,
        action: 'UPDATE',
        entityType: 'USER',
        entityId: id,
        details: JSON.stringify({ entity: 'PERSONIL', nip: personil.nip, nama: personil.nama }),
      },
    });

    successResponse(res, personil, 'Personil updated successfully');
  } catch (error) {
    console.error('Update Personil error:', error);
    errorResponse(res, 'Failed to update Personil', 500);
  }
};

// DELETE /api/personil/:id  -- SUPERADMIN / ADMIN_RTUPP only (enforced by route)
export const deletePersonil = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId as string;
    const { id } = req.params;

    const existing = await prisma.personil.findUnique({ where: { id } });
    if (!existing) {
      errorResponse(res, 'Personil not found', 404);
      return;
    }

    // Per-RTUPP scope: ADMIN may only delete personil in their own RTUPP; MASTER any.
    if (!isMaster(req.user?.role)) {
      const adminRtuppId = await resolveAdminRtuppId(userId);
      if (!adminRtuppId || existing.rtuppId !== adminRtuppId) {
        forbiddenResponse(res, 'Akses ditolak: personil di luar RTUPP Anda');
        return;
      }
    }

    await prisma.personil.delete({ where: { id } });

    await prisma.activityLog.create({
      data: {
        userId,
        action: 'DELETE',
        entityType: 'USER',
        entityId: id,
        details: JSON.stringify({ entity: 'PERSONIL', nip: existing.nip, nama: existing.nama }),
      },
    });

    successResponse(res, null, 'Personil deleted successfully');
  } catch (error) {
    console.error('Delete Personil error:', error);
    errorResponse(res, 'Failed to delete Personil', 500);
  }
};
