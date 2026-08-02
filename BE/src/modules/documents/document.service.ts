import { documentRepository, DocumentRepository, CreateDocumentData } from './document.repository';
import { locationRepository } from '../locations/location.repository';
import { assetRepository } from '../assets/asset.repository';
import { NotFoundError } from '../../utils/appError';
import { recordAuditLog } from '../../utils/auditLog';
import type { TenantScope } from '../../utils/tenantScope';
import type { CreateDocumentInput, ListDocumentQuery } from './document.validation';

/**
 * Document Service — business logic only.
 * Enforces that any referenced location/asset exists before persisting.
 */
export class DocumentService {
  constructor(private readonly repo: DocumentRepository = documentRepository) {}

  async list(query: ListDocumentQuery, scope: TenantScope) {
    const { data, total, page, limit } = await this.repo.findAll(query, scope);
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getById(id: string, scope: TenantScope) {
    const doc = await this.repo.findById(id, scope);
    if (!doc) throw new NotFoundError('Document not found');
    return doc;
  }

  async create(input: CreateDocumentInput, fileUrl: string, documentName: string, userId: string | undefined, scope: TenantScope) {
    if (input.locationId && !(await locationRepository.findById(input.locationId, scope))) {
      throw new NotFoundError(`Location "${input.locationId}" not found`);
    }
    if (input.assetId && !(await assetRepository.findById(input.assetId, scope))) {
      throw new NotFoundError(`Asset "${input.assetId}" not found`);
    }

    const data: CreateDocumentData = {
      locationId: input.locationId ?? null,
      assetId: input.assetId ?? null,
      documentType: input.documentType,
      documentName: input.documentName?.trim() || documentName,
      fileUrl,
    };
    const created = await this.repo.create(data, userId);
    await recordAuditLog({
      entityType: 'Document',
      entityId: created.id,
      action: 'CREATE',
      newValue: created,
      performedBy: userId,
    });
    return created;
  }

  async remove(id: string, userId: string | undefined, scope: TenantScope) {
    const current = await this.getById(id, scope);
    await this.repo.softDelete(id, userId);
    await recordAuditLog({
      entityType: 'Document',
      entityId: id,
      action: 'DELETE',
      oldValue: current,
      performedBy: userId,
    });
  }
}

export const documentService = new DocumentService();
