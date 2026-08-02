import { assetRepository, AssetRepository } from './asset.repository';
import { feederRepository } from '../feeders/feeder.repository';
import { locationRepository } from '../locations/location.repository';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../utils/appError';
import { generateUniqueCode } from '../../utils/generateCode';
import { recordAuditLog } from '../../utils/auditLog';
import type { TenantScope } from '../../utils/tenantScope';
import type { CreateAssetInput, UpdateAssetInput, ListAssetQuery } from './asset.validation';

/**
 * Asset Service — business logic only.
 * Enforces FK integrity (location/feeder/parent), unique assetCode &
 * serialNumber, and asset-hierarchy rules (no self-parent, no cycles).
 */
export class AssetService {
  constructor(private readonly repo: AssetRepository = assetRepository) {}

  async list(query: ListAssetQuery, scope: TenantScope) {
    const { data, total, page, limit } = await this.repo.findAll(query, scope);
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getById(id: string, scope: TenantScope) {
    // The scope predicate is applied in the query: an out-of-tenant asset reads
    // as "not found" (404) — no existence leak, fail-closed.
    const asset = await this.repo.findById(id, scope);
    if (!asset) throw new NotFoundError('Asset not found');
    return asset;
  }

  /**
   * Live monitoring summary for RTU communication state. Primary source is the
   * latest SP7 RTU snapshot (upload NOC — global by nature), counted from its
   * individual scada_rtu_rows — the same universe as the Inscan/OOP dashboard
   * (/scada-realtime) — NOT the header totalUp/totalDown computed at upload;
   * falls back to the legacy per-asset operState counts when no snapshot exists.
   */
  async scadaRtuSummary(scope: TenantScope) {
    const statusRows = await this.repo.latestScadaRtuStatusCounts();
    if (statusRows) {
      let up = 0;
      let down = 0;
      let unknown = 0;
      for (const r of statusRows) {
        const n = r._count._all;
        if (r.operState === 'UP') up += n;
        else if (r.operState === 'DOWN') down += n;
        else unknown += n; // LISTEN dsb. — bukan UP/DOWN
      }
      const total = up + down + unknown;
      const availability = up + down > 0 ? Number(((up / (up + down)) * 100).toFixed(2)) : null;
      return { total, up, down, unknown, availability };
    }

    const groups = await this.repo.groupRtuByOperState(scope);
    let up = 0;
    let down = 0;
    let unknown = 0;
    for (const g of groups) {
      const n = g._count._all;
      if (g.operState === 'UP') up += n;
      else if (g.operState === 'DOWN') down += n;
      else unknown += n; // null / never-imported
    }
    const total = up + down + unknown;
    const availability = up + down > 0 ? Number(((up / (up + down)) * 100).toFixed(2)) : null;
    return { total, up, down, unknown, availability };
  }

  private async assertLocationExists(locationId: string, scope: TenantScope) {
    // Scoped lookup: an out-of-tenant location is treated as non-existent, so a
    // scoped user cannot attach/move an asset into another RTUPP's location.
    if (!(await locationRepository.findById(locationId, scope))) {
      throw new NotFoundError(`Location "${locationId}" not found`);
    }
  }

  private async assertFeederExists(feederId: string, locationId: string) {
    const feeder = await feederRepository.findById(feederId);
    if (!feeder) throw new NotFoundError(`Feeder "${feederId}" not found`);
    if (feeder.locationId !== locationId) {
      throw new BusinessRuleError('Feeder does not belong to the given location');
    }
  }

  private async assertParentValid(parentAssetId: string, scope: TenantScope, selfId?: string) {
    if (selfId && parentAssetId === selfId) {
      throw new BusinessRuleError('Asset cannot be its own parent');
    }
    const parent = await this.repo.findById(parentAssetId, scope);
    if (!parent) throw new NotFoundError(`Parent asset "${parentAssetId}" not found`);
    // Prevent a 1-level cycle (A→B, B→A). Deeper cycles are unlikely given the
    // shallow RTU→MODEM / RECTIFIER→BATTERY_BANK hierarchy in the TDD.
    if (selfId && parent.parentAssetId === selfId) {
      throw new BusinessRuleError('Circular asset hierarchy is not allowed');
    }
  }

  private async assertUniqueCode(assetCode: string, ignoreId?: string) {
    const existing = await this.repo.findByCode(assetCode);
    if (existing && existing.id !== ignoreId) {
      throw new ConflictError(`Asset code "${assetCode}" already exists`);
    }
  }

  private async assertUniqueSerial(serialNumber: string, ignoreId?: string) {
    const existing = await this.repo.findBySerial(serialNumber);
    if (existing && existing.id !== ignoreId) {
      throw new ConflictError(`Serial number "${serialNumber}" already exists`);
    }
  }

  async create(input: CreateAssetInput, userId: string | undefined, scope: TenantScope) {
    await this.assertLocationExists(input.locationId, scope);
    if (input.feederId) await this.assertFeederExists(input.feederId, input.locationId);
    if (input.parentAssetId) await this.assertParentValid(input.parentAssetId, scope);

    let assetCode = input.assetCode?.trim();
    if (assetCode) {
      await this.assertUniqueCode(assetCode);
    } else {
      // UI path: derive a hidden, unique code from the asset name.
      assetCode = await generateUniqueCode(
        input.assetName,
        async (c) => !!(await this.repo.findByCode(c)),
        { fallback: input.assetType, maxLength: 100 },
      );
    }
    if (input.serialNumber) await this.assertUniqueSerial(input.serialNumber);
    const created = await this.repo.create({ ...input, assetCode }, userId);
    await recordAuditLog({
      entityType: 'Asset',
      entityId: created.id,
      action: 'CREATE',
      newValue: created,
      performedBy: userId,
    });
    return created;
  }

  async update(id: string, input: UpdateAssetInput, userId: string | undefined, scope: TenantScope) {
    const current = await this.getById(id, scope);
    const locationId = input.locationId ?? current.locationId;

    if (input.locationId) await this.assertLocationExists(input.locationId, scope);
    if (input.feederId) await this.assertFeederExists(input.feederId, locationId);
    if (input.parentAssetId) await this.assertParentValid(input.parentAssetId, scope, id);
    if (input.assetCode) await this.assertUniqueCode(input.assetCode, id);
    if (input.serialNumber) await this.assertUniqueSerial(input.serialNumber, id);

    const updated = await this.repo.update(id, input, userId);
    // BR-008: an asset move (location/feeder change) must be auditable — the
    // old/new snapshot below records the relocation alongside any other edit.
    await recordAuditLog({
      entityType: 'Asset',
      entityId: id,
      action: 'UPDATE',
      oldValue: current,
      newValue: updated,
      performedBy: userId,
    });
    return updated;
  }

  async remove(id: string, userId: string | undefined, scope: TenantScope) {
    const current = await this.getById(id, scope);
    const childCount = await this.repo.countActiveChildren(id);
    if (childCount > 0) {
      throw new BusinessRuleError('Cannot delete an asset that still has child assets');
    }
    await this.repo.softDelete(id, userId);
    await recordAuditLog({
      entityType: 'Asset',
      entityId: id,
      action: 'DELETE',
      oldValue: current,
      performedBy: userId,
    });
  }
}

export const assetService = new AssetService();
