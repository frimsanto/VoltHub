import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { isFieldOfficer, hasGlobalScope, isMaster } from '../auth/roles';
import prisma from '../config/database';
import { historyQuerySchema } from '../validators/laporanValidators';
import { successResponse, errorResponse, validationErrorResponse } from '../utils/response';
import { tallyStatusCounts } from '../utils/reportStatus';
import { LaporanAwal, LaporanAkhir } from '@prisma/client';

// Unified History API - combines all report types
export const getHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId || !userRole) {
      errorResponse(res, 'User not authenticated', 401);
      return;
    }

    // Validate query params
    const queryValidation = historyQuerySchema.safeParse(req.query);
    if (!queryValidation.success) {
      validationErrorResponse(res, queryValidation.error.format());
      return;
    }

    const { jenis, status, search, page = 1, limit = 10, startDate, endDate, createdBy } = queryValidation.data;

    // Build base where conditions
    //   MASTER / ADMIN / Manager UP3      -> all reports (optionally filtered
    //                                        by createdBy)
    //   ASMEN (MANAGER + rtuppId)         -> reports created by members of their RTUPP
    //   PETUGAS                           -> only their own reports
    const baseWhere: Record<string, unknown> = {};

    if (isFieldOfficer(userRole)) {
      baseWhere.createdById = userId;
    } else if (!isMaster(userRole)) {
      // ADMIN (incl. legacy ADMIN_RTUPP) / MANAGER — resolve the operator's
      // RTUPP first so an ASMEN (MANAGER + rtuppId) is scoped, never global.
      const opUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { rtuppId: true },
      });
      const ownRtuppId = opUser?.rtuppId ?? null;
      if (hasGlobalScope(userRole, ownRtuppId)) {
        // ADMIN / Manager UP3 (global) → optional explicit createdBy filter only.
        if (createdBy) baseWhere.createdById = createdBy;
      } else {
        if (!ownRtuppId) {
          errorResponse(res, 'ADMIN harus terdaftar di suatu RTUPP', 403);
          return;
        }
        baseWhere.createdBy = { rtuppId: ownRtuppId };
        if (createdBy) baseWhere.createdById = createdBy;
      }
    } else if (createdBy) {
      // MASTER (global audit read) → optional explicit createdBy filter only.
      baseWhere.createdById = createdBy;
    }

    if (status) {
      baseWhere.status = status;
    }

    // Date range filter
    const dateField = 'createdAt';
    if (startDate || endDate) {
      const dateFilter: Record<string, Date> = {};
      if (startDate) dateFilter.gte = new Date(startDate);
      if (endDate) dateFilter.lte = new Date(endDate + 'T23:59:59');
      (baseWhere as any)[dateField] = dateFilter;
    }

    // Search filter
    const searchWhere: Record<string, unknown> = {};
    if (search) {
      searchWhere.OR = [
        { reportId: { contains: search, mode: 'insensitive' as const } },
        { pekerjaan: { contains: search, mode: 'insensitive' as const } },
      ];
    }

    const skip = (page - 1) * limit;
    const results: Array<LaporanAwal | LaporanAkhir> = [];
    let total = 0;

    // Fetch Laporan Awal
    if (jenis === 'ALL' || jenis === 'AWAL') {
      const awalWhere = {
        ...baseWhere,
        ...(search ? {
          OR: [
            { reportId: { contains: search, mode: 'insensitive' as const } },
            { pekerjaan: { contains: search, mode: 'insensitive' as const } },
            { lokasiGardu: { contains: search, mode: 'insensitive' as const } },
            { nomorSPJ: { contains: search, mode: 'insensitive' as const } },
          ],
        } : {}),
      };

      const [awalData, awalCount] = await Promise.all([
        prisma.laporanAwal.findMany({
          where: awalWhere,
          skip: jenis === 'AWAL' ? skip : 0,
          take: jenis === 'AWAL' ? limit : (jenis === 'ALL' ? 100 : 0),
          orderBy: { createdAt: 'desc' },
          include: {
            createdBy: {
              select: {
                id: true, name: true, email: true,
                rtupp: { select: { id: true, name: true, code: true } },
                team: { select: { id: true, name: true, code: true } },
              },
            },
            validations: {
              orderBy: { validatedAt: 'asc' },
              include: {
                validator: {
                  select: { id: true, name: true },
                },
              },
            },
            _count: {
              select: { attachments: true },
            },
          },
        }),
        prisma.laporanAwal.count({ where: awalWhere }),
      ]);

      const awalMapped = awalData.map(item => ({
        ...item,
        jenis: 'AWAL',
        attachmentCount: item._count.attachments,
        _count: undefined,
      }));

      results.push(...awalMapped);
      total += awalCount;
    }

    // Fetch Laporan Akhir
    if (jenis === 'ALL' || jenis === 'AKHIR') {
      const akhirWhere = {
        ...baseWhere,
        ...(search ? {
          OR: [
            { reportId: { contains: search, mode: 'insensitive' as const } },
            { pekerjaan: { contains: search, mode: 'insensitive' as const } },
            { namaAset: { contains: search, mode: 'insensitive' as const } },
            { nomorSPJ: { contains: search, mode: 'insensitive' as const } },
          ],
        } : {}),
      };

      const [akhirData, akhirCount] = await Promise.all([
        prisma.laporanAkhir.findMany({
          where: akhirWhere,
          skip: jenis === 'AKHIR' ? skip : 0,
          take: jenis === 'AKHIR' ? limit : (jenis === 'ALL' ? 100 : 0),
          orderBy: { createdAt: 'desc' },
          include: {
            createdBy: {
              select: {
                id: true, name: true, email: true,
                rtupp: { select: { id: true, name: true, code: true } },
                team: { select: { id: true, name: true, code: true } },
              },
            },
            laporan_awal: {
              select: { id: true, reportId: true },
            },
            validations: {
              orderBy: { validatedAt: 'asc' },
              include: {
                validator: {
                  select: { id: true, name: true },
                },
              },
            },
            _count: {
              select: { attachments: true },
            },
          },
        }),
        prisma.laporanAkhir.count({ where: akhirWhere }),
      ]);

      const akhirMapped = akhirData.map(item => ({
        ...item,
        jenis: 'AKHIR',
        attachmentCount: (item as any)._count?.attachments || 0,
        _count: undefined,
      }));

      results.push(...akhirMapped);
      total += akhirCount;
    }

    // Sort all results by createdAt
    results.sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });

    // Manual pagination for ALL type
    let paginatedData = results;
    if (jenis === 'ALL') {
      paginatedData = results.slice(skip, skip + limit);
    }

    successResponse(
      res,
      {
        items: paginatedData,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      'History retrieved successfully'
    );
  } catch (error) {
    console.error('Get history error:', error);
    errorResponse(res, 'Failed to retrieve history', 500);
  }
};

// Get history statistics
export const getHistoryStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId || !userRole) {
      errorResponse(res, 'User not authenticated', 401);
      return;
    }

    let where: Record<string, unknown> = {};
    if (isFieldOfficer(userRole)) {
      where = { createdById: userId };
    } else if (!isMaster(userRole)) {
      // ADMIN (incl. legacy ADMIN_RTUPP) / MANAGER — resolve the operator's
      // RTUPP first so an ASMEN (MANAGER + rtuppId) is scoped, never global.
      const opUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { rtuppId: true },
      });
      const ownRtuppId = opUser?.rtuppId ?? null;
      if (!hasGlobalScope(userRole, ownRtuppId)) {
        if (!ownRtuppId) {
          errorResponse(res, 'ADMIN harus terdaftar di suatu RTUPP', 403);
          return;
        }
        where = { createdBy: { rtuppId: ownRtuppId } };
      }
    }

    const [awalStats, akhirStats] = await Promise.all([
      prisma.laporanAwal.groupBy({
        by: ['status'],
        where,
        _count: { status: true },
      }),
      prisma.laporanAkhir.groupBy({
        by: ['status'],
        where,
        _count: { status: true },
      }),
    ]);

    const awalCounts = tallyStatusCounts(awalStats);
    const akhirCounts = tallyStatusCounts(akhirStats);

    successResponse(res, {
      laporanAwal: awalCounts,
      laporanAkhir: akhirCounts,
      total: awalCounts.total + akhirCounts.total,
    }, 'History statistics retrieved successfully');
  } catch (error) {
    console.error('Get history stats error:', error);
    errorResponse(res, 'Failed to retrieve history statistics', 500);
  }
};
