// VoltHub — Attachment Laporan Inspeksi MP (instansiasi service+controller generik
// dari mp-shared). Mirror LaporanInspeksiGhAttachment; ADITIF.
import path from 'path';
import prisma from '../../config/database';
import { createMpAttachmentService } from '../mp-shared/mp-attachment.service';
import { createMpAttachmentController } from '../mp-shared/mp-attachment.controller';

export const laporanInspeksiMpAttachmentService = createMpAttachmentService({
  label: 'Inspeksi MP',
  parentIdField: 'laporanInspeksiMpId',
  findParent: (id) =>
    prisma.laporanInspeksiMp.findUnique({ where: { id }, include: { location: true } }),
  attachmentDelegate: prisma.laporanInspeksiMpAttachment as never,
  uploadDir: path.join(process.cwd(), 'private-uploads', 'inspeksi-mp-attachments'),
});

export const laporanInspeksiMpAttachmentController = createMpAttachmentController(
  laporanInspeksiMpAttachmentService,
);
