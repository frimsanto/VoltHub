import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../../config/database';
import { GiAttachmentCategory, GiAttachmentStatus } from '@prisma/client';
import { AppError, NotFoundError, ForbiddenError } from '../../utils/appError';
import { TenantScope, rtuppInScope } from '../../utils/tenantScope';
import { videoCompressorQueue, validateFileMime } from './video-compressor.worker';

export interface Actor {
  userId: string;
  role?: string | null;
}

const PRIVATE_UPLOAD_DIR = path.join(process.cwd(), 'private-uploads', 'gi-attachments');

// Ensure directories exist
if (!fs.existsSync(PRIVATE_UPLOAD_DIR)) {
  fs.mkdirSync(PRIVATE_UPLOAD_DIR, { recursive: true });
}
const RAW_VIDEO_DIR = path.join(PRIVATE_UPLOAD_DIR, 'raw');
if (!fs.existsSync(RAW_VIDEO_DIR)) {
  fs.mkdirSync(RAW_VIDEO_DIR, { recursive: true });
}

export class LaporanGiAttachmentService {
  async upload(
    laporanGiId: string,
    category: GiAttachmentCategory,
    tempFilePath: string,
    originalName: string,
    fileSize: number,
    actor: Actor,
    scope: TenantScope
  ) {
    // 1. Verify report exists and within scope
    const report = await this.getReportAndCheckScope(laporanGiId, scope);

    // 2. Strict Magic Bytes MIME validation
    const mimeCheck = validateFileMime(tempFilePath, category);
    if (!mimeCheck.isValid) {
      // Clean up temp file
      try {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      } catch (err) {}
      throw new AppError(`Tipe file tidak valid untuk kategori ${category}`, 400);
    }

    const fileExt = path.extname(originalName).toLowerCase();
    const uniqueId = uuidv4();
    const finalFileName = `${uniqueId}${fileExt}`;

    let filePath = path.join(PRIVATE_UPLOAD_DIR, finalFileName);
    let originalPath: string | null = null;
    let status: GiAttachmentStatus = GiAttachmentStatus.READY;

    if (category === GiAttachmentCategory.VIDEO) {
      // For video, the uploaded file is the raw original file
      originalPath = path.join(RAW_VIDEO_DIR, `${uniqueId}_raw${fileExt}`);
      status = GiAttachmentStatus.PROCESSING;
      // filePath will be the compressed target
      filePath = path.join(PRIVATE_UPLOAD_DIR, `${uniqueId}.mp4`);

      // Move temp file to originalPath
      fs.renameSync(tempFilePath, originalPath);
    } else {
      // For non-video files, move temp file directly to final filePath
      fs.renameSync(tempFilePath, filePath);
    }

    // 3. Save to database
    const att = await prisma.laporanGiAttachment.create({
      data: {
        id: uniqueId,
        laporanGiId,
        category,
        status,
        fileName: category === GiAttachmentCategory.VIDEO ? `${uniqueId}.mp4` : finalFileName,
        originalName,
        mimeType: mimeCheck.mimeType,
        fileSize,
        filePath,
        originalPath,
        uploadedById: actor.userId
      }
    });

    // 4. Trigger video compression in background if video
    if (category === GiAttachmentCategory.VIDEO) {
      videoCompressorQueue.enqueue(att.id);
    }

    return att;
  }

  async list(laporanGiId: string, actor: Actor, scope: TenantScope) {
    // Verify report scope
    await this.getReportAndCheckScope(laporanGiId, scope);

    return prisma.laporanGiAttachment.findMany({
      where: {
        laporanGiId,
        deletedAt: null
      },
      orderBy: {
        createdAt: 'asc'
      }
    });
  }

  async softDelete(attachmentId: string, actor: Actor, scope: TenantScope) {
    // 1. Verify attachment exists and in scope
    const att = await this.getAttachmentAndCheckScope(attachmentId, scope);

    // 2. Mark as soft deleted
    return prisma.laporanGiAttachment.update({
      where: { id: attachmentId },
      data: { deletedAt: new Date() }
    });
  }

  async getDownloadInfo(attachmentId: string, actor: Actor, scope: TenantScope) {
    // 1. Verify scope
    const att = await this.getAttachmentAndCheckScope(attachmentId, scope);

    if (att.status !== GiAttachmentStatus.READY && att.status !== GiAttachmentStatus.FAILED) {
      throw new AppError('File lampiran belum siap diunduh (sedang diproses)', 400);
    }

    return {
      filePath: att.filePath,
      originalName: att.originalName,
      mimeType: att.mimeType
    };
  }

  async getPosterPath(attachmentId: string, actor: Actor, scope: TenantScope) {
    const att = await this.getAttachmentAndCheckScope(attachmentId, scope);

    if (att.category !== GiAttachmentCategory.VIDEO) {
      throw new AppError('Kategori lampiran bukan video', 400);
    }

    if (!att.thumbnailPath || !fs.existsSync(att.thumbnailPath)) {
      throw new NotFoundError('Poster video belum siap atau tidak tersedia');
    }

    return att.thumbnailPath;
  }

  // --- Scoping Helpers ---
  private async getReportAndCheckScope(laporanGiId: string, scope: TenantScope) {
    const report = await prisma.laporanGi.findUnique({
      where: { id: laporanGiId },
      include: { location: true }
    });
    if (!report || report.deletedAt) {
      throw new NotFoundError('Laporan GI tidak ditemukan');
    }
    if (!rtuppInScope(scope, report.location.rtuppId)) {
      throw new ForbiddenError('Anda tidak memiliki akses ke RTUPP laporan ini');
    }
    return report;
  }

  private async getAttachmentAndCheckScope(attachmentId: string, scope: TenantScope) {
    const att = await prisma.laporanGiAttachment.findFirst({
      where: { id: attachmentId, deletedAt: null },
      include: { laporanGi: { include: { location: true } } }
    });
    if (!att) {
      throw new NotFoundError('Lampiran tidak ditemukan');
    }
    if (!rtuppInScope(scope, att.laporanGi.location.rtuppId)) {
      throw new ForbiddenError('Anda tidak memiliki akses ke RTUPP lampiran ini');
    }
    return att;
  }
}

export const laporanGiAttachmentService = new LaporanGiAttachmentService();
