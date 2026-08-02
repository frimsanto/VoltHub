// VoltHub — Attachment Laporan HAR MP (instansiasi service+controller generik dari
// mp-shared). Mirror LaporanHarGhAttachment; ADITIF.
import path from 'path';
import prisma from '../../config/database';
import { createMpAttachmentService } from '../mp-shared/mp-attachment.service';
import { createMpAttachmentController } from '../mp-shared/mp-attachment.controller';

export const laporanHarMpAttachmentService = createMpAttachmentService({
  label: 'HAR MP',
  parentIdField: 'laporanHarMpId',
  findParent: (id) =>
    prisma.laporanHarMp.findUnique({ where: { id }, include: { location: true } }),
  attachmentDelegate: prisma.laporanHarMpAttachment as never,
  uploadDir: path.join(process.cwd(), 'private-uploads', 'har-mp-attachments'),
});

export const laporanHarMpAttachmentController = createMpAttachmentController(
  laporanHarMpAttachmentService,
);
