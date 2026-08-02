// VoltHub — Attachment controller GENERIK (Inspeksi GH & HAR GH). Mirror
// LaporanGiAttachmentController; parameterized oleh service instance per modul.
import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { successResponse } from '../../utils/response';
import { resolveRequestScope } from '../../utils/tenantScope';
import { GiAttachmentCategory } from '@prisma/client';
import { AppError } from '../../utils/appError';
import type { createGhAttachmentService } from './gh-attachment.service';

type GhAttachmentService = ReturnType<typeof createGhAttachmentService>;

export function createGhAttachmentController(service: GhAttachmentService) {
  return {
    upload: async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { id: parentId } = req.params;
        const file = req.file;
        if (!file) throw new AppError('File tidak boleh kosong', 400);

        const category = req.body.category as GiAttachmentCategory;
        if (!category || !Object.values(GiAttachmentCategory).includes(category)) {
          throw new AppError('Kategori lampiran tidak valid', 400);
        }

        const scope = await resolveRequestScope(req.user);
        const actor = { userId: req.user!.userId, role: req.user!.role };

        const att = await service.upload(parentId, category, file.path, file.originalname, file.size, actor, scope);
        successResponse(res, att, 'File lampiran berhasil diupload', 201);
      } catch (err) {
        next(err);
      }
    },

    list: async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { id: parentId } = req.params;
        const scope = await resolveRequestScope(req.user);
        const actor = { userId: req.user!.userId, role: req.user!.role };
        const list = await service.list(parentId, actor, scope);
        successResponse(res, list, 'Daftar lampiran berhasil diambil');
      } catch (err) {
        next(err);
      }
    },

    delete: async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { attId } = req.params;
        const scope = await resolveRequestScope(req.user);
        const actor = { userId: req.user!.userId, role: req.user!.role };
        await service.softDelete(attId, actor, scope);
        successResponse(res, null, 'Lampiran berhasil dihapus');
      } catch (err) {
        next(err);
      }
    },

    download: async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { attId } = req.params;
        const scope = await resolveRequestScope(req.user);
        const actor = { userId: req.user!.userId, role: req.user!.role };
        const { filePath, originalName, mimeType } = await service.getDownloadInfo(attId, actor, scope);
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(originalName)}"`);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.sendFile(filePath);
      } catch (err) {
        next(err);
      }
    },

    thumbnail: async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
      try {
        const { attId } = req.params;
        const scope = await resolveRequestScope(req.user);
        const actor = { userId: req.user!.userId, role: req.user!.role };
        const posterPath = await service.getPosterPath(attId, actor, scope);
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Content-Disposition', 'inline');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.sendFile(posterPath);
      } catch (err) {
        next(err);
      }
    },
  };
}
