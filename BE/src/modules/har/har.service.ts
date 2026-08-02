import { harRepository, HarRepository } from './har.repository';
import { locationRepository } from '../locations/location.repository';
import { assetRepository } from '../assets/asset.repository';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../utils/appError';
import type { TenantScope } from '../../utils/tenantScope';
import type {
  CreateHarReportInput,
  CreateHarDetailInput,
  UpdateHarDetailInput,
  ListHarQuery,
} from './har.validation';

/**
 * HAR Service — business logic only.
 * Flow (TDD §15): create HAR → add asset-status details.
 * Business rules: location & asset must exist; asset must belong to the HAR's
 * location; one detail per asset per HAR report.
 */
export class HarService {
  constructor(private readonly repo: HarRepository = harRepository) {}

  async list(query: ListHarQuery, scope: TenantScope) {
    const { data, total, page, limit } = await this.repo.findAll(query, scope);
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getById(id: string, scope: TenantScope) {
    const report = await this.repo.findById(id, scope);
    if (!report) throw new NotFoundError('HAR report not found');
    return report;
  }

  async create(input: CreateHarReportInput, userId: string | undefined, scope: TenantScope) {
    if (!(await locationRepository.findById(input.locationId, scope))) {
      throw new NotFoundError(`Location "${input.locationId}" not found`);
    }
    return this.repo.createReport(input, userId);
  }

  async addDetail(reportId: string, input: CreateHarDetailInput, userId: string | undefined, scope: TenantScope) {
    const report = await this.getById(reportId, scope);

    const asset = await assetRepository.findById(input.assetId, scope);
    if (!asset) throw new NotFoundError(`Asset "${input.assetId}" not found`);
    if (asset.locationId !== report.locationId) {
      throw new BusinessRuleError('Asset does not belong to the HAR report location');
    }

    const existing = await this.repo.findDetailByReportAndAsset(reportId, input.assetId);
    if (existing) {
      throw new ConflictError('This asset already has a record in this HAR report');
    }

    return this.repo.createDetail(reportId, input, userId);
  }

  private async getDetailOfReport(reportId: string, detailId: string, scope: TenantScope) {
    await this.getById(reportId, scope);
    const detail = await this.repo.findDetailById(detailId);
    if (!detail || detail.harReportId !== reportId) {
      throw new NotFoundError('HAR detail not found in this report');
    }
    return detail;
  }

  async updateDetail(reportId: string, detailId: string, input: UpdateHarDetailInput, userId: string | undefined, scope: TenantScope) {
    await this.getDetailOfReport(reportId, detailId, scope);
    return this.repo.updateDetail(detailId, input, userId);
  }

  async removeDetail(reportId: string, detailId: string, scope: TenantScope) {
    await this.getDetailOfReport(reportId, detailId, scope);
    await this.repo.deleteDetail(detailId);
  }
}

export const harService = new HarService();
