import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { isAdmin as isAdminRole } from '../auth/roles';
import prisma from '../config/database';
import { successResponse, errorResponse, notFoundResponse, validationErrorResponse } from '../utils/response';
import path from 'path';
import fs from 'fs';
import { env } from '../config/env';

// Upload directory base path
const UPLOAD_BASE_DIR = path.join(process.cwd(), env.UPLOAD_DIR);

// File size limits (in bytes)
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB for images

// Allowed file types
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_DOCUMENT_TYPES = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
const ALLOWED_LOGGER_TYPES = ['text/plain', 'text/csv', 'application/octet-stream'];

// Stored-XSS hardening for the file-serving endpoints (preview/download).
//
// The stored `mimeType` is client-declared at upload time, so it cannot be
// trusted to decide whether a file is safe to render inline. Only raster images
// (NEVER image/svg+xml — SVG can carry <script>) are served `inline`; every
// other type is forced to `attachment` so the browser downloads rather than
// renders it. `nosniff` stops MIME-confusion sniffing, and a locked-down CSP +
// sandbox neutralise any markup that does reach a rendering context.
const INLINE_SAFE_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
]);

/** Strip CR/LF/quotes so a client-controlled filename can't break the header. */
const safeContentDispositionName = (name: string): string =>
  name.replace(/[\r\n"\\]/g, '_').slice(0, 200) || 'download';

/**
 * Apply hardened headers and the correct disposition for serving a stored file.
 * Returns the Content-Type actually sent. SVG and any non-raster type are sent
 * as a download (never inline-rendered).
 */
const applySafeFileHeaders = (
  res: Response,
  mimeType: string,
  originalName: string,
  forceDownload = false
): void => {
  const inlineSafe = !forceDownload && INLINE_SAFE_IMAGE_TYPES.has(mimeType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('Content-Type', inlineSafe ? mimeType : 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    inlineSafe
      ? 'inline'
      : `attachment; filename="${safeContentDispositionName(originalName)}"`
  );
};

// Attachment.category is a DB enum (`attachments_category`). Inserting a value
// outside this set throws and 500s the upload, so every incoming category is
// normalized here: exact enum values pass through, known client aliases map to
// the closest valid value, and anything unknown falls back to FOTO_PEKERJAAN
// instead of crashing.
const VALID_CATEGORIES = [
  'FOTO_SEBELUM',
  'FOTO_BRIEFING',
  'FOTO_APD',
  'FOTO_PEKERJAAN',
  'FOTO_HASIL',
  'LOGGER_FILE',
  'SLD_FILE',
] as const;
type AttachmentCategory = (typeof VALID_CATEGORIES)[number];

const CATEGORY_ALIASES: Record<string, AttachmentCategory> = {
  DOKUMENTASI_ALL: 'FOTO_PEKERJAAN', // Laporan Awal all-in-one bucket
  DOKUMENTASI_HASIL: 'FOTO_HASIL', // Laporan Akhir documentation
  DOKUMENTASI_LAIN: 'FOTO_PEKERJAAN',
  DOKUMENTASI: 'FOTO_PEKERJAAN',
};

const normalizeCategory = (raw?: string): AttachmentCategory => {
  const v = (raw || '').toUpperCase();
  if ((VALID_CATEGORIES as readonly string[]).includes(v)) return v as AttachmentCategory;
  return CATEGORY_ALIASES[v] ?? 'FOTO_PEKERJAAN';
};

// Ensure directory exists
const ensureDir = (dirPath: string) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

// Get upload directory based on jenis and category
const getUploadDir = (jenis: string, category: string): string => {
  const jenisFolder = jenis.toLowerCase().replace('laporan-', '');
  let subFolder = 'images';
  
  if (category.includes('LOGGER')) subFolder = 'logger';
  else if (category.includes('SLD')) subFolder = 'sld';
  else if (category.includes('FOTO')) subFolder = 'images';
  else subFolder = 'documents';
  
  const uploadDir = path.join(UPLOAD_BASE_DIR, jenisFolder, subFolder);
  ensureDir(uploadDir);
  return uploadDir;
};

// Upload files
export const uploadFiles = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { jenis } = req.params; // laporan-awal, laporan-akhir
    const { laporanId, category } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      errorResponse(res, 'User not authenticated', 401);
      return;
    }

    // Validate jenis
    const validJenis = ['laporan-awal', 'laporan-akhir'];
    if (!validJenis.includes(jenis)) {
      validationErrorResponse(res, { jenis: 'Invalid jenis. Use: laporan-awal, laporan-akhir' });
      return;
    }

    // Check if laporan exists and belongs to user (unless admin)
    let laporan: any;
    const userRole = req.user?.role;
    const isAdmin = isAdminRole(userRole);

    if (jenis === 'laporan-awal') {
      laporan = await prisma.laporanAwal.findUnique({ where: { id: laporanId } });
    } else {
      laporan = await prisma.laporanAkhir.findUnique({ where: { id: laporanId } });
    }

    if (!laporan) {
      notFoundResponse(res, 'Laporan not found');
      return;
    }

    if (!isAdmin && laporan.createdById !== userId) {
      errorResponse(res, 'Access denied', 403);
      return;
    }

    // Get uploaded files
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      errorResponse(res, 'No files uploaded', 400);
      return;
    }

    // Process each file
    const attachments = await Promise.all(
      files.map(async (file) => {
        const attachment = await prisma.attachment.create({
          data: {
            originalName: file.originalname,
            fileName: file.filename,
            mimeType: file.mimetype,
            size: file.size,
            path: file.path,
            laporanAwalId: jenis === 'laporan-awal' ? laporanId : null,
            laporanAkhirId: jenis === 'laporan-akhir' ? laporanId : null,
            category: normalizeCategory(category),
            uploadedById: userId,
          },
        });
        return attachment;
      })
    );

    // Log activity
    await prisma.activityLog.create({
      data: {
        userId,
        action: 'CREATE',
        entityType: 'ATTACHMENT',
        entityId: attachments[0].id,
        laporanAwalId: jenis === 'laporan-awal' ? laporanId : null,
        laporanAkhirId: jenis === 'laporan-akhir' ? laporanId : null,
        details: JSON.stringify({
          count: files.length,
          files: files.map(f => f.originalname),
        }),
      },
    });

    successResponse(
      res,
      {
        uploaded: attachments.length,
        attachments,
      },
      'Files uploaded successfully',
      201
    );
  } catch (error) {
    console.error('Upload error:', error);
    errorResponse(res, 'Failed to upload files', 500);
  }
};

// Get attachment by ID
export const getAttachment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId) {
      errorResponse(res, 'User not authenticated', 401);
      return;
    }

    const attachment = await prisma.attachment.findUnique({
      where: { id },
    });

    if (!attachment) {
      notFoundResponse(res, 'Attachment not found');
      return;
    }

    // Check access
    const isAdmin = isAdminRole(userRole);
    if (!isAdmin && attachment.uploadedById !== userId) {
      errorResponse(res, 'Access denied', 403);
      return;
    }

    // Return file or metadata based on query param
    const { download } = req.query;
    
    if (download === 'true') {
      // Stream file download
      if (!fs.existsSync(attachment.path)) {
        notFoundResponse(res, 'File not found on disk');
        return;
      }

      applySafeFileHeaders(res, attachment.mimeType, attachment.originalName, true);

      const fileStream = fs.createReadStream(attachment.path);
      fileStream.pipe(res);
    } else {
      // Return metadata with preview URL
      const previewUrl = `/api/upload/preview/${id}`;
      successResponse(res, {
        ...attachment,
        previewUrl,
        downloadUrl: `/api/upload/${id}?download=true`,
      }, 'Attachment retrieved successfully');
    }
  } catch (error) {
    console.error('Get attachment error:', error);
    errorResponse(res, 'Failed to retrieve attachment', 500);
  }
};

// Preview attachment (streams the file inline)
export const previewAttachment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId) {
      errorResponse(res, 'User not authenticated', 401);
      return;
    }

    const attachment = await prisma.attachment.findUnique({
      where: { id },
    });

    if (!attachment) {
      notFoundResponse(res, 'Attachment not found');
      return;
    }

    // BUG-02: apply the same ownership/role checks as getAttachment.
    // SUPERADMIN and ADMIN_RTUPP may preview any attachment; PETUGAS only their own.
    const isAdmin = isAdminRole(userRole);
    if (!isAdmin && attachment.uploadedById !== userId) {
      errorResponse(res, 'Access denied', 403);
      return;
    }

    if (!fs.existsSync(attachment.path)) {
      notFoundResponse(res, 'File not found on disk');
      return;
    }

    // Only raster images are served inline; SVG and everything else download.
    applySafeFileHeaders(res, attachment.mimeType, attachment.originalName);

    const fileStream = fs.createReadStream(attachment.path);
    fileStream.pipe(res);
  } catch (error) {
    console.error('Preview error:', error);
    errorResponse(res, 'Failed to preview attachment', 500);
  }
};

// Delete attachment
export const deleteAttachment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId) {
      errorResponse(res, 'User not authenticated', 401);
      return;
    }

    const attachment = await prisma.attachment.findUnique({
      where: { id },
    });

    if (!attachment) {
      notFoundResponse(res, 'Attachment not found');
      return;
    }

    // Check permission
    const isAdmin = isAdminRole(userRole);
    if (!isAdmin && attachment.uploadedById !== userId) {
      errorResponse(res, 'Access denied', 403);
      return;
    }

    // Delete file from disk
    if (fs.existsSync(attachment.path)) {
      fs.unlinkSync(attachment.path);
    }

    // Delete from database
    await prisma.attachment.delete({
      where: { id },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        userId,
        action: 'DELETE',
        entityType: 'ATTACHMENT',
        entityId: id,
        details: JSON.stringify({
          fileName: attachment.originalName,
          laporanAwalId: attachment.laporanAwalId,
          laporanAkhirId: attachment.laporanAkhirId,
        }),
      },
    });

    successResponse(res, null, 'Attachment deleted successfully');
  } catch (error) {
    console.error('Delete attachment error:', error);
    errorResponse(res, 'Failed to delete attachment', 500);
  }
};

// Get attachments by laporan
export const getAttachmentsByLaporan = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { jenis, laporanId } = req.params;
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId) {
      errorResponse(res, 'User not authenticated', 401);
      return;
    }

    // Check laporan access
    let laporan: any = null;
    const isAdmin = isAdminRole(userRole);

    if (jenis === 'laporan-awal') {
      laporan = await prisma.laporanAwal.findUnique({ where: { id: laporanId } });
    } else if (jenis === 'laporan-akhir') {
      laporan = await prisma.laporanAkhir.findUnique({ where: { id: laporanId } });
    } else {
      validationErrorResponse(res, { jenis: 'Invalid jenis' });
      return;
    }

    if (!laporan) {
      notFoundResponse(res, 'Laporan not found');
      return;
    }

    if (!isAdmin && laporan.createdById !== userId) {
      errorResponse(res, 'Access denied', 403);
      return;
    }

    // Get attachments
    const where: Record<string, unknown> = {};
    if (jenis === 'laporan-awal') where.laporanAwalId = laporanId;
    else where.laporanAkhirId = laporanId;

    const attachments = await prisma.attachment.findMany({
      where,
      orderBy: { uploadedAt: 'desc' },
    });

    // Add preview URLs
    const attachmentsWithUrls = attachments.map(att => ({
      ...att,
      previewUrl: `/api/upload/preview/${att.id}`,
      downloadUrl: `/api/upload/${att.id}?download=true`,
    }));

    successResponse(res, attachmentsWithUrls, 'Attachments retrieved successfully');
  } catch (error) {
    console.error('Get attachments error:', error);
    errorResponse(res, 'Failed to retrieve attachments', 500);
  }
};

// Upload categorized files for Laporan Akhir (Logger, SLD, Dokumentasi Hasil)
export const uploadCategorizedFiles = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { laporanId, categories } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      errorResponse(res, 'User not authenticated', 401);
      return;
    }

    // Check if laporan exists and belongs to user (unless admin)
    const userRole = req.user?.role;
    const isAdmin = isAdminRole(userRole);

    const laporan = await prisma.laporanAkhir.findUnique({ where: { id: laporanId } });

    if (!laporan) {
      notFoundResponse(res, 'Laporan not found');
      return;
    }

    if (!isAdmin && laporan.createdById !== userId) {
      errorResponse(res, 'Access denied', 403);
      return;
    }

    // Get uploaded files
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      errorResponse(res, 'No files uploaded', 400);
      return;
    }

    // Validate file sizes and types
    for (const file of files) {
      // Check file size
      if (file.size > MAX_FILE_SIZE) {
        errorResponse(res, `File "${file.originalname}" exceeds maximum size of 10MB`, 400);
        return;
      }

      // Check file type
      const isImage = ALLOWED_IMAGE_TYPES.includes(file.mimetype);
      const isDocument = ALLOWED_DOCUMENT_TYPES.includes(file.mimetype);
      const isLogger = ALLOWED_LOGGER_TYPES.includes(file.mimetype);

      if (!isImage && !isDocument && !isLogger) {
        errorResponse(res, `File type "${file.mimetype}" is not allowed for "${file.originalname}"`, 400);
        return;
      }

      // Additional size check for images
      if (isImage && file.size > MAX_IMAGE_SIZE) {
        errorResponse(res, `Image "${file.originalname}" exceeds maximum size of 5MB`, 400);
        return;
      }
    }

    // Parse categories array
    const categoryList = Array.isArray(categories) ? categories : [categories];

    // Process each file with its corresponding category
    const attachments = await Promise.all(
      files.map(async (file, index) => {
        const category = normalizeCategory(categoryList[index]);
        const attachment = await prisma.attachment.create({
          data: {
            originalName: file.originalname,
            fileName: file.filename,
            mimeType: file.mimetype,
            size: file.size,
            path: file.path,
            laporanAkhirId: laporanId,
            category: category,
            uploadedById: userId,
          },
        });
        return attachment;
      })
    );

    // Log activity
    await prisma.activityLog.create({
      data: {
        userId,
        action: 'CREATE',
        entityType: 'ATTACHMENT',
        entityId: attachments[0].id,
        laporanAkhirId: laporanId,
        details: JSON.stringify({
          count: files.length,
          files: files.map(f => f.originalname),
          categories: categoryList,
        }),
      },
    });

    successResponse(
      res,
      {
        uploaded: attachments.length,
        attachments,
      },
      'Files uploaded successfully',
      201
    );
  } catch (error) {
    console.error('Upload categorized error:', error);
    errorResponse(res, 'Failed to upload files', 500);
  }
};
