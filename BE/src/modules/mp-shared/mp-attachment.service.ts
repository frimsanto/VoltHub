// VoltHub — Attachment service GENERIK untuk Laporan Inspeksi MP & HAR MP.
// Mirror 1:1 pola gh-shared/gh-attachment.service (Inspeksi GH/HAR GH); parameterized
// per parent (Inspeksi/HAR) via config karena nama FK (laporanInspeksiMpId/laporanHarMpId)
// dan model induk (laporanInspeksiMp/laporanHarMp) berbeda. ADITIF — tidak menyentuh GH/GI.
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { GiAttachmentCategory, GiAttachmentStatus } from '@prisma/client';
import { AppError, NotFoundError, ForbiddenError } from '../../utils/appError';
import { TenantScope, rtuppInScope } from '../../utils/tenantScope';
import { validateFileMime, createGhVideoCompressorQueue } from '../gh-shared/gh-video-compressor.worker';

export interface Actor {
  userId: string;
  role?: string | null;
}

interface ParentReport {
  id: string;
  deletedAt: Date | null;
  location: { rtuppId: string | null };
}

export interface AttachmentRow {
  id: string;
  status: GiAttachmentStatus;
  category: GiAttachmentCategory;
  filePath: string;
  originalName: string;
  mimeType: string;
  thumbnailPath: string | null;
  deletedAt: Date | null;
  [key: string]: unknown; // parentIdField (laporanInspeksiMpId | laporanHarMpId) + relation
}

interface AttachmentDelegate {
  create(args: { data: Record<string, unknown> }): Promise<AttachmentRow>;
  findMany(args: unknown): Promise<AttachmentRow[]>;
  findFirst(args: unknown): Promise<(AttachmentRow & Record<string, unknown>) | null>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<AttachmentRow>;
}

export interface MpAttachmentConfig {
  /** label dipakai di log worker, mis. "Inspeksi MP" / "HAR MP". */
  label: string;
  /** nama kolom FK di tabel attachment: 'laporanInspeksiMpId' | 'laporanHarMpId'. */
  parentIdField: 'laporanInspeksiMpId' | 'laporanHarMpId';
  /** cari laporan induk + lokasi (untuk scope check); null bila tak ada/soft-deleted. */
  findParent: (id: string) => Promise<ParentReport | null>;
  /** delegate prisma attachment (prisma.laporanInspeksiMpAttachment / laporanHarMpAttachment). */
  attachmentDelegate: AttachmentDelegate;
  /** direktori upload privat, mis. private-uploads/inspeksi-mp-attachments. */
  uploadDir: string;
}

export function createMpAttachmentService(cfg: MpAttachmentConfig) {
  const PRIVATE_UPLOAD_DIR = cfg.uploadDir;
  if (!fs.existsSync(PRIVATE_UPLOAD_DIR)) fs.mkdirSync(PRIVATE_UPLOAD_DIR, { recursive: true });
  const RAW_VIDEO_DIR = path.join(PRIVATE_UPLOAD_DIR, 'raw');
  if (!fs.existsSync(RAW_VIDEO_DIR)) fs.mkdirSync(RAW_VIDEO_DIR, { recursive: true });

  const videoQueue = createGhVideoCompressorQueue(cfg.label, cfg.attachmentDelegate as never);

  async function getReportAndCheckScope(parentId: string, scope: TenantScope): Promise<ParentReport> {
    const report = await cfg.findParent(parentId);
    if (!report || report.deletedAt) {
      throw new NotFoundError(`Laporan ${cfg.label} tidak ditemukan`);
    }
    if (!rtuppInScope(scope, report.location.rtuppId)) {
      throw new ForbiddenError('Anda tidak memiliki akses ke RTUPP laporan ini');
    }
    return report;
  }

  async function getAttachmentAndCheckScope(attachmentId: string, scope: TenantScope) {
    // NOTE: field relasi balik ke parent di schema.prisma bernama `laporan` untuk
    // KEDUA model attachment MP (LaporanInspeksiMpAttachment & LaporanHarMpAttachment),
    // bukan `laporanInspeksiMp`/`laporanHarMp` — pakai nama relasi asli agar Prisma
    // `include` tidak gagal di runtime (lihat TUGAS 11 audit).
    const parentRelation = 'laporan' as const;
    const att = await cfg.attachmentDelegate.findFirst({
      where: { id: attachmentId, deletedAt: null },
      include: { [parentRelation]: { include: { location: true } } },
    });
    if (!att) throw new NotFoundError('Lampiran tidak ditemukan');
    const parent = att[parentRelation] as { location: { rtuppId: string } } | undefined;
    if (!parent || !rtuppInScope(scope, parent.location.rtuppId)) {
      throw new ForbiddenError('Anda tidak memiliki akses ke RTUPP lampiran ini');
    }
    return att;
  }

  return {
    videoQueue,

    async upload(
      parentId: string,
      category: GiAttachmentCategory,
      tempFilePath: string,
      originalName: string,
      fileSize: number,
      actor: Actor,
      scope: TenantScope,
    ) {
      await getReportAndCheckScope(parentId, scope);

      const mimeCheck = validateFileMime(tempFilePath, category);
      if (!mimeCheck.isValid) {
        try {
          if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        } catch {
          /* best-effort cleanup */
        }
        throw new AppError(`Tipe file tidak valid untuk kategori ${category}`, 400);
      }

      const fileExt = path.extname(originalName).toLowerCase();
      const uniqueId = uuidv4();
      let filePath = path.join(PRIVATE_UPLOAD_DIR, `${uniqueId}${fileExt}`);
      let originalPath: string | null = null;
      let status: GiAttachmentStatus = GiAttachmentStatus.READY;

      if (category === GiAttachmentCategory.VIDEO) {
        originalPath = path.join(RAW_VIDEO_DIR, `${uniqueId}_raw${fileExt}`);
        status = GiAttachmentStatus.PROCESSING;
        filePath = path.join(PRIVATE_UPLOAD_DIR, `${uniqueId}.mp4`);
        fs.renameSync(tempFilePath, originalPath);
      } else {
        fs.renameSync(tempFilePath, filePath);
      }

      const att = await cfg.attachmentDelegate.create({
        data: {
          id: uniqueId,
          [cfg.parentIdField]: parentId,
          category,
          status,
          fileName: category === GiAttachmentCategory.VIDEO ? `${uniqueId}.mp4` : path.basename(filePath),
          originalName,
          mimeType: mimeCheck.mimeType,
          fileSize,
          filePath,
          originalPath,
          uploadedById: actor.userId,
        },
      });

      if (category === GiAttachmentCategory.VIDEO) videoQueue.enqueue(att.id);

      return att;
    },

    async list(parentId: string, _actor: Actor, scope: TenantScope) {
      await getReportAndCheckScope(parentId, scope);
      return cfg.attachmentDelegate.findMany({
        where: { [cfg.parentIdField]: parentId, deletedAt: null },
        orderBy: { createdAt: 'asc' },
      });
    },

    async softDelete(attachmentId: string, _actor: Actor, scope: TenantScope) {
      await getAttachmentAndCheckScope(attachmentId, scope);
      return cfg.attachmentDelegate.update({ where: { id: attachmentId }, data: { deletedAt: new Date() } });
    },

    async getDownloadInfo(attachmentId: string, _actor: Actor, scope: TenantScope) {
      const att = await getAttachmentAndCheckScope(attachmentId, scope);
      if (att.status !== GiAttachmentStatus.READY && att.status !== GiAttachmentStatus.FAILED) {
        throw new AppError('File lampiran belum siap diunduh (sedang diproses)', 400);
      }
      return { filePath: att.filePath, originalName: att.originalName, mimeType: att.mimeType };
    },

    async getPosterPath(attachmentId: string, _actor: Actor, scope: TenantScope) {
      const att = await getAttachmentAndCheckScope(attachmentId, scope);
      if (att.category !== GiAttachmentCategory.VIDEO) {
        throw new AppError('Kategori lampiran bukan video', 400);
      }
      if (!att.thumbnailPath || !fs.existsSync(att.thumbnailPath)) {
        throw new NotFoundError('Poster video belum siap atau tidak tersedia');
      }
      return att.thumbnailPath;
    },
  };
}
