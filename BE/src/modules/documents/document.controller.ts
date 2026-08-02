import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { successResponse, errorResponse } from '../../utils/response';
import { resolveRequestScope } from '../../utils/tenantScope';
import { documentService } from './document.service';
import { createDocumentSchema } from './document.validation';
import type { ListDocumentQuery } from './document.validation';

export class DocumentController {
  list = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const { data, meta } = await documentService.list(req.query as unknown as ListDocumentQuery, scope);
      successResponse(res, data, 'Documents retrieved successfully', 200, meta);
    } catch (err) {
      next(err);
    }
  };

  getById = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const doc = await documentService.getById(req.params.id, scope);
      successResponse(res, doc, 'Document retrieved successfully');
    } catch (err) {
      next(err);
    }
  };

  // POST /documents — multipart/form-data (locationId, assetId, documentType, file)
  create = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) {
        errorResponse(res, 'File is required (field "file")', 422);
        return;
      }
      // Validate the text fields (multer leaves them in req.body as strings).
      const parsed = createDocumentSchema.safeParse(req.body);
      if (!parsed.success) {
        errorResponse(res, 'Validation failed', 422, parsed.error.format());
        return;
      }

      const sub = req.file.mimetype.startsWith('image/') ? 'images' : 'documents';
      const fileUrl = `/uploads/${sub}/${req.file.filename}`;

      const scope = await resolveRequestScope(req.user);
      const doc = await documentService.create(parsed.data, fileUrl, req.file.originalname, req.user?.userId, scope);
      successResponse(res, doc, 'Document uploaded successfully', 201);
    } catch (err) {
      next(err);
    }
  };

  remove = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      await documentService.remove(req.params.id, req.user?.userId, scope);
      successResponse(res, null, 'Document deleted successfully');
    } catch (err) {
      next(err);
    }
  };
}

export const documentController = new DocumentController();
