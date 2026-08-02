import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import type { ListJobsQuery } from './import.validation';

export interface ImportErrorRecord {
  rowNumber: number;
  errorMessage: string;
  rawData: Prisma.InputJsonValue;
}

/**
 * Import Repository — Prisma access for import_jobs / import_errors.
 */
export class ImportRepository {
  createJob(data: { fileName: string; fileUrl: string | null; importType: string }, userId?: string) {
    return prisma.importJob.create({
      data: {
        fileName: data.fileName,
        fileUrl: data.fileUrl,
        importType: data.importType,
        status: 'PROCESSING',
        startedAt: new Date(),
        createdBy: userId ?? null,
      },
    });
  }

  finalizeJob(
    id: string,
    result: { totalRows: number; successRows: number; failedRows: number; status: string }
  ) {
    return prisma.importJob.update({
      where: { id },
      data: { ...result, finishedAt: new Date() },
    });
  }

  async saveErrors(importJobId: string, errors: ImportErrorRecord[]) {
    if (errors.length === 0) return;
    await prisma.importError.createMany({
      data: errors.map((e) => ({
        importJobId,
        rowNumber: e.rowNumber,
        errorMessage: e.errorMessage,
        rawData: e.rawData,
      })),
    });
  }

  async findAll(query: ListJobsQuery) {
    const { page, limit, status } = query;
    const skip = (page - 1) * limit;
    const where: Prisma.ImportJobWhereInput = { ...(status ? { status } : {}) };

    const [data, total] = await Promise.all([
      prisma.importJob.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { errors: true } } },
      }),
      prisma.importJob.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  findById(id: string) {
    return prisma.importJob.findUnique({ where: { id }, include: { _count: { select: { errors: true } } } });
  }

  findErrors(importJobId: string) {
    return prisma.importError.findMany({ where: { importJobId }, orderBy: { rowNumber: 'asc' } });
  }
}

export const importRepository = new ImportRepository();
