import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';

// Mock fs to prevent actual file writes/deletes
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
    renameSync: vi.fn(),
    unlinkSync: vi.fn(),
    statSync: vi.fn().mockReturnValue({ size: 12345 }),
    readFileSync: vi.fn().mockReturnValue('mock,csv,content\n1,2,3'),
  }
}));

// Mock video-compressor.worker methods so it doesn't run real ffmpeg
vi.mock('./video-compressor.worker', () => {
  return {
    videoCompressorQueue: {
      enqueue: vi.fn(),
      resumePending: vi.fn()
    },
    validateFileMime: vi.fn().mockReturnValue({ isValid: true, mimeType: 'image/png' }),
    getVideoDuration: vi.fn().mockResolvedValue(45)
  };
});

// Mock database config
vi.mock('../../config/database');

import prisma, { resetPrismaMock } from '../../config/database';
import { LaporanGiAttachmentService } from './laporan-gi-attachment.service';
import { GiAttachmentCategory, GiAttachmentStatus } from '@prisma/client';
import { ForbiddenError, NotFoundError } from '../../utils/appError';
import { validateFileMime } from './video-compressor.worker';

const anyPrisma = prisma as any;

describe('LaporanGiAttachmentService', () => {
  const service = new LaporanGiAttachmentService();
  const actor = { userId: 'user-1', role: 'PETUGAS' };
  const scope = { global: false, rtuppId: 'rtupp-1' };

  beforeEach(() => {
    resetPrismaMock();
    vi.clearAllMocks();
    // Default validateFileMime mock success
    vi.mocked(validateFileMime).mockReturnValue({ isValid: true, mimeType: 'image/png' });
  });

  describe('upload', () => {
    it('uploads non-video (FOTO/SLD/LOGGER) directly and marks status as READY', async () => {
      // Mock LaporanGi fetch
      anyPrisma.laporanGi.findUnique.mockResolvedValue({
        id: 'report-1',
        deletedAt: null,
        location: { rtuppId: 'rtupp-1' }
      });

      anyPrisma.laporanGiAttachment.create.mockResolvedValue({
        id: 'att-1',
        status: GiAttachmentStatus.READY
      });

      const res = await service.upload(
        'report-1',
        GiAttachmentCategory.FOTO,
        'temp/file.png',
        'file.png',
        1000,
        actor,
        scope
      );

      expect(res.status).toBe(GiAttachmentStatus.READY);
      expect(anyPrisma.laporanGiAttachment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          laporanGiId: 'report-1',
          category: GiAttachmentCategory.FOTO,
          status: GiAttachmentStatus.READY,
          fileName: expect.any(String),
          originalName: 'file.png',
          fileSize: 1000,
          uploadedById: 'user-1'
        })
      });
    });

    it('uploads video and marks status as PROCESSING and enqueues to video queue', async () => {
      vi.mocked(validateFileMime).mockReturnValue({ isValid: true, mimeType: 'video/mp4' });

      anyPrisma.laporanGi.findUnique.mockResolvedValue({
        id: 'report-1',
        deletedAt: null,
        location: { rtuppId: 'rtupp-1' }
      });

      anyPrisma.laporanGiAttachment.create.mockResolvedValue({
        id: 'att-video-1',
        status: GiAttachmentStatus.PROCESSING
      });

      const res = await service.upload(
        'report-1',
        GiAttachmentCategory.VIDEO,
        'temp/file.mp4',
        'file.mp4',
        5000,
        actor,
        scope
      );

      expect(res.status).toBe(GiAttachmentStatus.PROCESSING);
      expect(anyPrisma.laporanGiAttachment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          category: GiAttachmentCategory.VIDEO,
          status: GiAttachmentStatus.PROCESSING,
          originalPath: expect.stringContaining('raw')
        })
      });
    });

    it('rejects upload for cross-RTUPP location with 403 Forbidden', async () => {
      // Report belongs to rtupp-other, operator belongs to rtupp-1
      anyPrisma.laporanGi.findUnique.mockResolvedValue({
        id: 'report-1',
        deletedAt: null,
        location: { rtuppId: 'rtupp-other' }
      });

      await expect(
        service.upload(
          'report-1',
          GiAttachmentCategory.FOTO,
          'temp/file.png',
          'file.png',
          1000,
          actor,
          scope
        )
      ).rejects.toThrowError(ForbiddenError);

      expect(anyPrisma.laporanGiAttachment.create).not.toHaveBeenCalled();
    });

    it('rejects upload for non-existent report with 404 Not Found', async () => {
      anyPrisma.laporanGi.findUnique.mockResolvedValue(null);

      await expect(
        service.upload(
          'report-not-found',
          GiAttachmentCategory.FOTO,
          'temp/file.png',
          'file.png',
          1000,
          actor,
          scope
        )
      ).rejects.toThrowError(NotFoundError);
    });

    it('rejects invalid file type with 400 Bad Request', async () => {
      anyPrisma.laporanGi.findUnique.mockResolvedValue({
        id: 'report-1',
        deletedAt: null,
        location: { rtuppId: 'rtupp-1' }
      });

      vi.mocked(validateFileMime).mockReturnValue({ isValid: false, mimeType: '' });

      await expect(
        service.upload(
          'report-1',
          GiAttachmentCategory.FOTO,
          'temp/file.exe', // invalid
          'file.exe',
          1000,
          actor,
          scope
        )
      ).rejects.toThrowError('Tipe file tidak valid untuk kategori FOTO');
    });
  });

  describe('list', () => {
    it('lists attachments for a valid scoped report', async () => {
      anyPrisma.laporanGi.findUnique.mockResolvedValue({
        id: 'report-1',
        deletedAt: null,
        location: { rtuppId: 'rtupp-1' }
      });

      anyPrisma.laporanGiAttachment.findMany.mockResolvedValue([
        { id: 'att-1', category: 'FOTO' }
      ]);

      const res = await service.list('report-1', actor, scope);

      expect(res).toHaveLength(1);
      expect(anyPrisma.laporanGiAttachment.findMany).toHaveBeenCalledWith({
        where: { laporanGiId: 'report-1', deletedAt: null },
        orderBy: { createdAt: 'asc' }
      });
    });

    it('rejects listing for cross-RTUPP report with 403', async () => {
      anyPrisma.laporanGi.findUnique.mockResolvedValue({
        id: 'report-1',
        deletedAt: null,
        location: { rtuppId: 'rtupp-other' }
      });

      await expect(service.list('report-1', actor, scope)).rejects.toThrowError(ForbiddenError);
    });
  });

  describe('softDelete', () => {
    it('marks attachment as soft deleted if scoped correctly', async () => {
      anyPrisma.laporanGiAttachment.findFirst.mockResolvedValue({
        id: 'att-1',
        laporanGi: {
          location: { rtuppId: 'rtupp-1' }
        }
      });

      await service.softDelete('att-1', actor, scope);

      expect(anyPrisma.laporanGiAttachment.update).toHaveBeenCalledWith({
        where: { id: 'att-1' },
        data: { deletedAt: expect.any(Date) }
      });
    });

    it('rejects softDelete for cross-RTUPP attachment with 403', async () => {
      anyPrisma.laporanGiAttachment.findFirst.mockResolvedValue({
        id: 'att-1',
        laporanGi: {
          location: { rtuppId: 'rtupp-other' }
        }
      });

      await expect(service.softDelete('att-1', actor, scope)).rejects.toThrowError(ForbiddenError);
    });
  });

  describe('download', () => {
    it('returns download file path and info if attachment is READY', async () => {
      anyPrisma.laporanGiAttachment.findFirst.mockResolvedValue({
        id: 'att-1',
        status: GiAttachmentStatus.READY,
        filePath: 'private-uploads/gi-attachments/file.png',
        originalName: 'file.png',
        mimeType: 'image/png',
        laporanGi: {
          location: { rtuppId: 'rtupp-1' }
        }
      });

      const info = await service.getDownloadInfo('att-1', actor, scope);
      expect(info.filePath).toBe('private-uploads/gi-attachments/file.png');
      expect(info.originalName).toBe('file.png');
    });

    it('throws 400 error if attachment status is PROCESSING', async () => {
      anyPrisma.laporanGiAttachment.findFirst.mockResolvedValue({
        id: 'att-1',
        status: GiAttachmentStatus.PROCESSING,
        laporanGi: {
          location: { rtuppId: 'rtupp-1' }
        }
      });

      await expect(service.getDownloadInfo('att-1', actor, scope)).rejects.toThrowError(
        'File lampiran belum siap diunduh (sedang diproses)'
      );
    });
  });
});
