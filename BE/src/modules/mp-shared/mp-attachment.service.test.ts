import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
    renameSync: vi.fn(),
    unlinkSync: vi.fn(),
    statSync: vi.fn().mockReturnValue({ size: 12345 }),
    readFileSync: vi.fn().mockReturnValue('mock,csv,content\n1,2,3'),
  },
}));

vi.mock('../gh-shared/gh-video-compressor.worker', () => ({
  createGhVideoCompressorQueue: vi.fn(() => ({ enqueue: vi.fn(), resumePending: vi.fn() })),
  validateFileMime: vi.fn().mockReturnValue({ isValid: true, mimeType: 'image/png' }),
  getVideoDuration: vi.fn().mockResolvedValue(45),
}));

import { createMpAttachmentService } from './mp-attachment.service';
import { validateFileMime } from '../gh-shared/gh-video-compressor.worker';
import { GiAttachmentCategory, GiAttachmentStatus } from '@prisma/client';
import { ForbiddenError, NotFoundError, AppError } from '../../utils/appError';

const actor = { userId: 'user-1', role: 'PETUGAS' };
const scope = { global: false, rtuppId: 'rtupp-2' } as any;

function makeDelegate(over: Record<string, any> = {}) {
  return {
    create: vi.fn().mockImplementation(async ({ data }: any) => ({ ...data })),
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn(),
    update: vi.fn().mockImplementation(async ({ where, data }: any) => ({ id: where.id, ...data })),
    ...over,
  };
}

function makeService(over: Record<string, any> = {}) {
  const attachmentDelegate = makeDelegate(over.attachmentDelegate);
  const findParent =
    over.findParent ??
    vi.fn().mockResolvedValue({ id: 'mp-report-1', deletedAt: null, location: { rtuppId: 'rtupp-2' } });
  const svc = createMpAttachmentService({
    label: 'Inspeksi MP',
    parentIdField: 'laporanInspeksiMpId',
    findParent,
    attachmentDelegate: attachmentDelegate as never,
    uploadDir: '/tmp/mp-attach-test',
  });
  return { svc, attachmentDelegate, findParent };
}

describe('mp-attachment.service — scope & upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(validateFileMime).mockReturnValue({ isValid: true, mimeType: 'image/png' });
  });

  it('upload menolak parent di luar RTUPP → ForbiddenError', async () => {
    const { svc } = makeService({
      findParent: vi.fn().mockResolvedValue({ id: 'mp-1', deletedAt: null, location: { rtuppId: 'rtupp-9' } }),
    });
    await expect(
      svc.upload('mp-1', GiAttachmentCategory.FOTO, '/tmp/x.png', 'x.png', 100, actor, scope),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('upload menolak parent tidak ditemukan → NotFoundError', async () => {
    const { svc } = makeService({ findParent: vi.fn().mockResolvedValue(null) });
    await expect(
      svc.upload('mp-x', GiAttachmentCategory.FOTO, '/tmp/x.png', 'x.png', 100, actor, scope),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('upload menolak mime tidak valid', async () => {
    vi.mocked(validateFileMime).mockReturnValue({ isValid: false, mimeType: '' });
    const { svc } = makeService();
    await expect(
      svc.upload('mp-report-1', GiAttachmentCategory.FOTO, '/tmp/x.exe', 'x.exe', 100, actor, scope),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('upload FOTO tersimpan READY dengan FK parentIdField benar', async () => {
    const { svc, attachmentDelegate } = makeService();
    const att = await svc.upload('mp-report-1', GiAttachmentCategory.FOTO, '/tmp/x.png', 'x.png', 100, actor, scope);
    expect(att.status).toBe(GiAttachmentStatus.READY);
    expect(att.laporanInspeksiMpId).toBe('mp-report-1');
    expect(attachmentDelegate.create).toHaveBeenCalledOnce();
  });

  it('upload VIDEO tersimpan PROCESSING', async () => {
    vi.mocked(validateFileMime).mockReturnValue({ isValid: true, mimeType: 'video/mp4' });
    const { svc } = makeService();
    const att = await svc.upload('mp-report-1', GiAttachmentCategory.VIDEO, '/tmp/x.mp4', 'x.mp4', 100, actor, scope);
    expect(att.status).toBe(GiAttachmentStatus.PROCESSING);
  });

  it('list menolak akses lintas-RTUPP', async () => {
    const { svc } = makeService({
      findParent: vi.fn().mockResolvedValue({ id: 'mp-1', deletedAt: null, location: { rtuppId: 'rtupp-9' } }),
    });
    await expect(svc.list('mp-1', actor, scope)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('softDelete & download menegakkan scope lewat getAttachmentAndCheckScope', async () => {
    const { svc, attachmentDelegate } = makeService({
      attachmentDelegate: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'att-1',
          status: GiAttachmentStatus.READY,
          filePath: '/tmp/f.png',
          originalName: 'f.png',
          mimeType: 'image/png',
          laporanInspeksiMp: { location: { rtuppId: 'rtupp-9' } },
        }),
      },
    });
    await expect(svc.softDelete('att-1', actor, scope)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(svc.getDownloadInfo('att-1', actor, scope)).rejects.toBeInstanceOf(ForbiddenError);
    expect(attachmentDelegate.update).not.toHaveBeenCalled();
  });

  it('getDownloadInfo menolak file yang masih PROCESSING', async () => {
    const { svc } = makeService({
      attachmentDelegate: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'att-1',
          status: GiAttachmentStatus.PROCESSING,
          filePath: '/tmp/f.mp4',
          originalName: 'f.mp4',
          mimeType: 'video/mp4',
          laporanInspeksiMp: { location: { rtuppId: 'rtupp-2' } },
        }),
      },
    });
    await expect(svc.getDownloadInfo('att-1', actor, scope)).rejects.toBeInstanceOf(AppError);
  });
});
