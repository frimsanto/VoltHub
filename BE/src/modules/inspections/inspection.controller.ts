import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { successResponse, errorResponse } from '../../utils/response';
import { resolveRequestScope } from '../../utils/tenantScope';
import { inspectionService } from './inspection.service';
import type {
  CreateInspectionInput,
  CreateFindingInput,
  ListInspectionQuery,
} from './inspection.validation';

export class InspectionController {
  list = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const { data, meta } = await inspectionService.list(req.query as unknown as ListInspectionQuery, scope);
      successResponse(res, data, 'Inspections retrieved successfully', 200, meta);
    } catch (err) {
      next(err);
    }
  };

  getById = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const inspection = await inspectionService.getById(req.params.id, scope);
      successResponse(res, inspection, 'Inspection retrieved successfully');
    } catch (err) {
      next(err);
    }
  };

  create = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const inspection = await inspectionService.create(
        req.body as CreateInspectionInput,
        req.user!.userId,
        req.user?.userId,
        scope
      );
      successResponse(res, inspection, 'Inspection created successfully', 201);
    } catch (err) {
      next(err);
    }
  };

  addFinding = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const finding = await inspectionService.addFinding(
        req.params.id,
        req.body as CreateFindingInput,
        req.user?.userId,
        scope
      );
      successResponse(res, finding, 'Finding added successfully', 201);
    } catch (err) {
      next(err);
    }
  };

  // POST /findings/:id/photos — multipart/form-data (field: photo, caption)
  addPhoto = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) {
        errorResponse(res, 'Photo file is required (field "photo")', 422);
        return;
      }
      const photoUrl = `/uploads/images/${req.file.filename}`;
      const caption = (req.body?.caption as string | undefined) ?? null;
      const scope = await resolveRequestScope(req.user);
      const photo = await inspectionService.addPhoto(req.params.id, photoUrl, caption, req.user?.userId, scope);
      successResponse(res, photo, 'Photo uploaded successfully', 201);
    } catch (err) {
      next(err);
    }
  };
}

export const inspectionController = new InspectionController();
