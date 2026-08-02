// VoltHub — Attachment Laporan Inspeksi GH (instansiasi service+controller generik
// dari gh-shared). Mirror LaporanGiAttachment (FASE C GI); ADITIF.
import path from 'path';
import prisma from '../../config/database';
import { createGhAttachmentService } from '../gh-shared/gh-attachment.service';
import { createGhAttachmentController } from '../gh-shared/gh-attachment.controller';

export const laporanInspeksiGhAttachmentService = createGhAttachmentService({
  label: 'Inspeksi GH',
  parentIdField: 'laporanInspeksiGhId',
  findParent: (id) =>
    prisma.laporanInspeksiGh.findUnique({ where: { id }, include: { location: true } }),
  attachmentDelegate: prisma.laporanInspeksiGhAttachment as never,
  uploadDir: path.join(process.cwd(), 'private-uploads', 'inspeksi-gh-attachments'),
});

export const laporanInspeksiGhAttachmentController = createGhAttachmentController(
  laporanInspeksiGhAttachmentService,
);
