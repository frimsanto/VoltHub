// VoltHub — Attachment Laporan HAR GH (instansiasi service+controller generik dari
// gh-shared). Mirror LaporanGiAttachment (FASE C GI); ADITIF.
import path from 'path';
import prisma from '../../config/database';
import { createGhAttachmentService } from '../gh-shared/gh-attachment.service';
import { createGhAttachmentController } from '../gh-shared/gh-attachment.controller';

export const laporanHarGhAttachmentService = createGhAttachmentService({
  label: 'HAR GH',
  parentIdField: 'laporanHarGhId',
  findParent: (id) =>
    prisma.laporanHarGh.findUnique({ where: { id }, include: { location: true } }),
  attachmentDelegate: prisma.laporanHarGhAttachment as never,
  uploadDir: path.join(process.cwd(), 'private-uploads', 'har-gh-attachments'),
});

export const laporanHarGhAttachmentController = createGhAttachmentController(
  laporanHarGhAttachmentService,
);
