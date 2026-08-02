import { Request, Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { isAdmin as isAdminRole } from '../auth/roles';
import * as laporanService from '../services/laporanAwalService';
import {
  createLaporanAwalSchema,
  updateLaporanAwalSchema,
  validateReportSchema,
  historyQuerySchema,
} from '../validators/laporanValidators';
import { successResponse, errorResponse, validationErrorResponse, notFoundResponse } from '../utils/response';

// Create Laporan Awal
export const create = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const validation = createLaporanAwalSchema.safeParse(req.body);
    
    if (!validation.success) {
      validationErrorResponse(res, validation.error.format());
      return;
    }

    const userId = req.user?.userId;
    if (!userId) {
      errorResponse(res, 'User not authenticated', 401);
      return;
    }

    const laporan = await laporanService.createLaporanAwal(validation.data, userId);
    successResponse(res, laporan, 'Laporan Awal created successfully', 201);
  } catch (error) {
    console.error('Create laporan awal error:', error);
    errorResponse(res, error instanceof Error ? error.message : 'Failed to create laporan', 500);
  }
};

// Get all Laporan Awal
export const getAll = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const userRole = req.user?.role;
    
    if (!userId || !userRole) {
      errorResponse(res, 'User not authenticated', 401);
      return;
    }

    const queryValidation = historyQuerySchema.partial().safeParse(req.query);
    const options = queryValidation.success ? queryValidation.data : {};

    const result = await laporanService.getAllLaporanAwal(userId, userRole, {
      status: options.status,
      search: options.search,
      page: options.page,
      limit: options.limit,
      startDate: options.startDate,
      endDate: options.endDate,
    });

    successResponse(res, result.data, 'Laporan Awal retrieved successfully', 200, result.meta);
  } catch (error) {
    console.error('Get laporan awal error:', error);
    errorResponse(res, 'Failed to retrieve laporan', 500);
  }
};

// Get Laporan Awal by ID
export const getById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId || !userRole) {
      errorResponse(res, 'User not authenticated', 401);
      return;
    }

    const laporan = await laporanService.getLaporanAwalById(id, userId, userRole);
    successResponse(res, laporan, 'Laporan Awal retrieved successfully');
  } catch (error) {
    if (error instanceof Error && error.message === 'Laporan not found') {
      notFoundResponse(res, 'Laporan Awal not found');
      return;
    }
    if (error instanceof Error && error.message === 'Access denied') {
      errorResponse(res, 'Access denied', 403);
      return;
    }
    console.error('Get laporan awal by id error:', error);
    errorResponse(res, 'Failed to retrieve laporan', 500);
  }
};

// Update Laporan Awal
export const update = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId || !userRole) {
      errorResponse(res, 'User not authenticated', 401);
      return;
    }

    const validation = updateLaporanAwalSchema.safeParse(req.body);
    
    if (!validation.success) {
      validationErrorResponse(res, validation.error.format());
      return;
    }

    const laporan = await laporanService.updateLaporanAwal(id, validation.data, userId, userRole);
    successResponse(res, laporan, 'Laporan Awal updated successfully');
  } catch (error) {
    if (error instanceof Error && error.message === 'Laporan not found') {
      notFoundResponse(res, 'Laporan Awal not found');
      return;
    }
    if (error instanceof Error && error.message === 'Access denied') {
      errorResponse(res, 'Access denied', 403);
      return;
    }
    if (error instanceof Error && error.message === 'Report is locked') {
      errorResponse(res, 'Report is locked and cannot be edited in its current status', 403);
      return;
    }
    if (error instanceof Error && error.message === 'Cannot edit approved report') {
      errorResponse(res, error.message, 400);
      return;
    }
    console.error('Update laporan awal error:', error);
    errorResponse(res, 'Failed to update laporan', 500);
  }
};

// Delete Laporan Awal
export const remove = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId || !userRole) {
      errorResponse(res, 'User not authenticated', 401);
      return;
    }

    const result = await laporanService.deleteLaporanAwal(id, userId, userRole);
    successResponse(res, result, 'Laporan Awal deleted successfully');
  } catch (error) {
    if (error instanceof Error && error.message === 'Laporan not found') {
      notFoundResponse(res, 'Laporan Awal not found');
      return;
    }
    if (error instanceof Error && error.message === 'Access denied') {
      errorResponse(res, 'Access denied', 403);
      return;
    }
    if (error instanceof Error && error.message === 'Report is locked') {
      errorResponse(res, 'Report is locked and cannot be deleted in its current status', 403);
      return;
    }
    if (error instanceof Error && error.message === 'Cannot delete approved report') {
      errorResponse(res, error.message, 400);
      return;
    }
    console.error('Delete laporan awal error:', error);
    errorResponse(res, 'Failed to delete laporan', 500);
  }
};

// Validate/Approve Laporan Awal (Admin only)
export const validate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId || !userRole) {
      errorResponse(res, 'User not authenticated', 401);
      return;
    }

    // Only ADMIN_RTUPP and SUPERADMIN can validate
    if (!isAdminRole(userRole)) {
      errorResponse(res, 'Only admin can validate reports', 403);
      return;
    }

    const validation = validateReportSchema.safeParse(req.body);
    
    if (!validation.success) {
      validationErrorResponse(res, validation.error.format());
      return;
    }

    const { status, notes } = validation.data;
    console.log('CONTROLLER VALIDATE LAPORAN AWAL:', { id, status, notes, userId });
    
    const laporan = await laporanService.validateLaporanAwal(id, status, notes, userId, userRole);

    const message = status === 'APPROVED'
      ? 'Laporan Awal approved successfully'
      : 'Laporan Awal rejected';

    successResponse(res, laporan, message);
  } catch (error) {
    console.error('VALIDATE LAPORAN AWAL ERROR:', error);
    if (error instanceof Error && error.message === 'Laporan not found') {
      notFoundResponse(res, 'Laporan Awal not found');
      return;
    }
    if (error instanceof Error && error.message === 'Access denied') {
      errorResponse(res, 'Laporan ini di luar RTUPP Anda', 403);
      return;
    }
    if (error instanceof Error && error.message === 'Can only validate pending reports') {
      errorResponse(res, error.message, 400);
      return;
    }
    errorResponse(res, error instanceof Error ? error.message : 'Failed to validate laporan', 500);
  }
};
