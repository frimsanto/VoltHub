import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import type { TenantScope } from '../../utils/tenantScope';
import type { ListDocumentQuery } from './document.validation';

const locationSelect = { select: { id: true, code: true, name: true } };
const assetSelect = { select: { id: true, assetCode: true, assetName: true } };

/**
 * Tenant predicate for documents. A document anchors to a location OR an asset
 * (both nullable), so it is in scope when EITHER its location or its asset's
 * location belongs to the RTUPP. GLOBAL → no predicate. Documents with no anchor
 * are invisible to scoped users (fail-closed).
 */
const documentScopeWhere = (scope: TenantScope): Prisma.DocumentWhereInput =>
  scope.global
    ? {}
    : {
        OR: [
          { location: { rtuppId: scope.rtuppId } },
          { asset: { location: { rtuppId: scope.rtuppId } } },
        ],
      };

export interface CreateDocumentData {
  locationId: string | null;
  assetId: string | null;
  documentType: Prisma.DocumentCreateInput['documentType'];
  documentName: string;
  fileUrl: string;
}

/**
 * Document Repository — only layer touching Prisma for documents.
 * Reads exclude soft-deleted rows (deletedAt IS NULL).
 */
export class DocumentRepository {
  private notDeleted = { deletedAt: null } satisfies Prisma.DocumentWhereInput;

  async findAll(query: ListDocumentQuery, scope: TenantScope) {
    const { page, limit, search, locationId, assetId, documentType } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.DocumentWhereInput = {
      ...this.notDeleted,
      ...documentScopeWhere(scope),
      ...(locationId ? { locationId } : {}),
      ...(assetId ? { assetId } : {}),
      ...(documentType ? { documentType } : {}),
      ...(search ? { documentName: { contains: search, mode: 'insensitive' as const } } : {}),
    };

    const [data, total] = await Promise.all([
      prisma.document.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { location: locationSelect, asset: assetSelect },
      }),
      prisma.document.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  findById(id: string, scope?: TenantScope) {
    return prisma.document.findFirst({
      where: { id, ...this.notDeleted, ...(scope ? documentScopeWhere(scope) : {}) },
      include: { location: locationSelect, asset: assetSelect },
    });
  }

  create(data: CreateDocumentData, userId?: string) {
    return prisma.document.create({
      data: {
        locationId: data.locationId,
        assetId: data.assetId,
        documentType: data.documentType,
        documentName: data.documentName,
        fileUrl: data.fileUrl,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
  }

  softDelete(id: string, userId?: string) {
    return prisma.document.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: userId ?? null },
    });
  }
}

export const documentRepository = new DocumentRepository();
