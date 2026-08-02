import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { isAdmin as isAdminRole } from '../auth/roles';
import * as laporanService from '../services/laporanAkhirService';
import {
  createLaporanAkhirSchema,
  updateLaporanAkhirSchema,
  validateReportSchema,
  historyQuerySchema,
} from '../validators/laporanValidators';
import { successResponse, errorResponse, validationErrorResponse, notFoundResponse } from '../utils/response';

// Create Laporan Akhir
export const create = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const validation = createLaporanAkhirSchema.safeParse(req.body);
    
    if (!validation.success) {
      validationErrorResponse(res, validation.error.format());
      return;
    }

    const userId = req.user?.userId;
    if (!userId) {
      errorResponse(res, 'User not authenticated', 401);
      return;
    }

    const laporan = await laporanService.createLaporanAkhir(validation.data, userId);
    successResponse(res, laporan, 'Laporan Akhir created successfully', 201);
  } catch (error) {
    // Log full detail server-side, but never leak raw ORM/DB errors to the client.
    console.error('Create laporan akhir error:', error);
    errorResponse(res, 'Gagal membuat laporan akhir', 500);
  }
};

// Get all Laporan Akhir
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

    const result = await laporanService.getAllLaporanAkhir(userId, userRole, {
      status: options.status,
      search: options.search,
      page: options.page,
      limit: options.limit,
      startDate: options.startDate,
      endDate: options.endDate,
    });

    successResponse(res, result.data, 'Laporan Akhir retrieved successfully', 200, result.meta);
  } catch (error) {
    console.error('Get laporan akhir error:', error);
    errorResponse(res, 'Failed to retrieve laporan', 500);
  }
};

// Get Laporan Akhir by ID
export const getById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId || !userRole) {
      errorResponse(res, 'User not authenticated', 401);
      return;
    }

    const laporan = await laporanService.getLaporanAkhirById(id, userId, userRole);
    successResponse(res, laporan, 'Laporan Akhir retrieved successfully');
  } catch (error) {
    if (error instanceof Error && error.message === 'Laporan not found') {
      notFoundResponse(res, 'Laporan Akhir not found');
      return;
    }
    if (error instanceof Error && error.message === 'Access denied') {
      errorResponse(res, 'Access denied', 403);
      return;
    }
    console.error('Get laporan akhir by id error:', error);
    errorResponse(res, 'Failed to retrieve laporan', 500);
  }
};

// Update Laporan Akhir
export const update = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId || !userRole) {
      errorResponse(res, 'User not authenticated', 401);
      return;
    }

    const validation = updateLaporanAkhirSchema.safeParse(req.body);
    
    if (!validation.success) {
      validationErrorResponse(res, validation.error.format());
      return;
    }

    const laporan = await laporanService.updateLaporanAkhir(id, validation.data, userId, userRole);
    successResponse(res, laporan, 'Laporan Akhir updated successfully');
  } catch (error) {
    if (error instanceof Error && error.message === 'Laporan not found') {
      notFoundResponse(res, 'Laporan Akhir not found');
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
    console.error('Update laporan akhir error:', error);
    errorResponse(res, 'Failed to update laporan', 500);
  }
};

// Delete Laporan Akhir
export const remove = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId || !userRole) {
      errorResponse(res, 'User not authenticated', 401);
      return;
    }

    const result = await laporanService.deleteLaporanAkhir(id, userId, userRole);
    successResponse(res, result, 'Laporan Akhir deleted successfully');
  } catch (error) {
    if (error instanceof Error && error.message === 'Laporan not found') {
      notFoundResponse(res, 'Laporan Akhir not found');
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
    console.error('Delete laporan akhir error:', error);
    errorResponse(res, 'Failed to delete laporan', 500);
  }
};

// Validate/Approve Laporan Akhir
export const validate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId || !userRole) {
      errorResponse(res, 'User not authenticated', 401);
      return;
    }

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
    const laporan = await laporanService.validateLaporanAkhir(id, status, notes, userId, userRole);

    const message = status === 'APPROVED'
      ? 'Laporan Akhir approved successfully'
      : 'Laporan Akhir rejected';

    successResponse(res, laporan, message);
  } catch (error) {
    if (error instanceof Error && error.message === 'Laporan not found') {
      notFoundResponse(res, 'Laporan Akhir not found');
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
    console.error('Validate laporan akhir error:', error);
    errorResponse(res, 'Failed to validate laporan', 500);
  }
};
