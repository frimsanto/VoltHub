import { inspectionRepository, InspectionRepository } from './inspection.repository';
import { locationRepository } from '../locations/location.repository';
import { assetRepository } from '../assets/asset.repository';
import { BusinessRuleError, NotFoundError } from '../../utils/appError';
import { rtuppInScope, type TenantScope } from '../../utils/tenantScope';
import type {
  CreateInspectionInput,
  CreateFindingInput,
  ListInspectionQuery,
} from './inspection.validation';

/**
 * Inspection Service — business logic only.
 * Flow (TDD §14): create inspection → add findings → upload photos.
 * Enforces FK integrity (location/asset/finding exist) and that a finding's
 * asset belongs to the inspection's location.
 */
export class InspectionService {
  constructor(private readonly repo: InspectionRepository = inspectionRepository) {}

  async list(query: ListInspectionQuery, scope: TenantScope) {
    const { data, total, page, limit } = await this.repo.findAll(query, scope);
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getById(id: string, scope: TenantScope) {
    const inspection = await this.repo.findById(id, scope);
    if (!inspection) throw new NotFoundError('Inspection not found');
    return inspection;
  }

  async create(input: CreateInspectionInput, inspectorId: string, userId: string | undefined, scope: TenantScope) {
    if (!(await locationRepository.findById(input.locationId, scope))) {
      throw new NotFoundError(`Location "${input.locationId}" not found`);
    }
    return this.repo.createInspection(input, inspectorId, userId);
  }

  async addFinding(inspectionId: string, input: CreateFindingInput, userId: string | undefined, scope: TenantScope) {
    const inspection = await this.getById(inspectionId, scope);

    const asset = await assetRepository.findById(input.assetId, scope);
    if (!asset) throw new NotFoundError(`Asset "${input.assetId}" not found`);
    if (asset.locationId !== inspection.locationId) {
      throw new BusinessRuleError('Asset does not belong to the inspection location');
    }

    return this.repo.createFinding(inspectionId, input, userId);
  }

  async addPhoto(
    findingId: string,
    photoUrl: string,
    caption: string | null,
    userId: string | undefined,
    scope: TenantScope
  ) {
    const finding = await this.repo.findFindingById(findingId);
    // Fail-closed: out-of-tenant finding reads as not-found.
    if (!finding || !rtuppInScope(scope, finding.inspection?.location?.rtuppId)) {
      throw new NotFoundError(`Finding "${findingId}" not found`);
    }
    // Photo inherits the finding's asset to keep the asset→photo link intact.
    return this.repo.createPhoto(findingId, finding.assetId, photoUrl, caption, userId);
  }
}

export const inspectionService = new InspectionService();
