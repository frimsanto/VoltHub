import { locationRepository, LocationRepository } from './location.repository';
import { ConflictError, NotFoundError, ValidationError } from '../../utils/appError';
import { generateUniqueCode } from '../../utils/generateCode';
import { recordAuditLog } from '../../utils/auditLog';
import { isLocationTypeAllowedForRtupp, locationTypeRuleMessage } from './location.constants';
import type { LocationType } from '@prisma/client';
import type { TenantScope } from '../../utils/tenantScope';
import type {
  CreateLocationInput,
  UpdateLocationInput,
  ListLocationQuery,
  VerifyCoordinatesInput,
} from './location.validation';

/**
 * Location Service — business logic only. No direct Prisma access.
 */
export class LocationService {
  constructor(private readonly repo: LocationRepository = locationRepository) {}

  /**
   * Enforce the per-RTUPP gardu-type rule (location.constants — the single
   * source shared with the import engine). Only applies when the gardu has an
   * owning RTUPP: a global creator's RTUPP-less gardu carries no rule. Throws a
   * 422 ValidationError naming the rule, the gardu code and the type.
   */
  private async assertTypeAllowed(
    rtuppId: string | null | undefined,
    type: LocationType,
    code: string,
  ): Promise<void> {
    if (!rtuppId) return;
    const rtupp = await this.repo.findRtupp(rtuppId);
    if (rtupp && !isLocationTypeAllowedForRtupp(rtupp, type)) {
      throw new ValidationError(
        `${locationTypeRuleMessage(rtupp)} Gardu "${code}" berjenis ${type} tidak diperbolehkan.`,
      );
    }
  }

  async list(query: ListLocationQuery, scope: TenantScope) {
    const { data, total, page, limit } = await this.repo.findAll(query, scope);
    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getById(id: string, scope: TenantScope) {
    const location = await this.repo.findById(id, scope);
    if (!location) {
      throw new NotFoundError('Location not found');
    }
    // Attach the supplying penyulang (distribution gardu → its upstream feeder).
    const supplyFeeder = await this.repo.findSupplyFeeder(id);
    return { ...location, supplyFeeder };
  }

  async create(input: CreateLocationInput, userId: string | undefined, scope: TenantScope) {
    let code = input.code?.trim();
    if (code) {
      // Explicit code (e.g. bulk import) — keep the conflict guard.
      const existing = await this.repo.findByCode(code);
      if (existing) {
        throw new ConflictError(`Location code "${code}" already exists`);
      }
    } else {
      // UI path: derive a hidden, unique code from the name.
      code = await generateUniqueCode(
        input.name,
        async (c) => !!(await this.repo.findByCode(c)),
        { fallback: input.locationType, maxLength: 50 },
      );
    }
    // Tenant ownership stamp: a scoped creator uses their scope's RTUPP. A
    // global creator falls back to their OWN rtuppId — ADMIN's read scope is
    // global (2026-07 policy) but a gardu they create must still belong to
    // their RTUPP, never end up tenant-orphaned. MASTER/MANAGER (no rtuppId)
    // still yield null.
    const rtuppId = scope.global
      ? (userId ? await this.repo.findUserRtuppId(userId) : null)
      : scope.rtuppId;
    // Per-RTUPP gardu-type rule (5B): reject e.g. a GARDU/GH under RTUPP1 or a
    // GI under RTUPP2–5 before persisting.
    await this.assertTypeAllowed(rtuppId, input.locationType, code);
    return this.repo.create({ ...input, code }, userId, rtuppId);
  }

  async update(id: string, input: UpdateLocationInput, userId: string | undefined, scope: TenantScope) {
    const current = await this.getById(id, scope);

    if (input.code) {
      const existing = await this.repo.findByCode(input.code);
      if (existing && existing.id !== id) {
        throw new ConflictError(`Location code "${input.code}" already exists`);
      }
    }

    // Per-RTUPP gardu-type rule (5B): when the type changes, validate the final
    // combination against the gardu's (immutable) RTUPP. rtuppId is not editable
    // here, so the owning RTUPP is the existing one.
    if (input.locationType !== undefined) {
      await this.assertTypeAllowed(current.rtuppId, input.locationType, input.code ?? current.code);
    }

    return this.repo.update(id, input, userId);
  }

  async remove(id: string, userId: string | undefined, scope: TenantScope) {
    await this.getById(id, scope);
    await this.repo.softDelete(id, userId);
  }

  /**
   * Field geo-verification during a gardu visit (PETUGAS / ADMIN / MASTER).
   *
   * CONFIRMED → "lokasi sesuai": no coordinate change, only an audit row marking
   * that the position was checked. CORRECTED → "tidak sesuai": persist the new
   * coordinates supplied by the field team so the map auto-updates, and record
   * the before/after in the immutable audit trail. Every verification (whether
   * it changed anything or not) is written to `audit_logs` so the history of
   * who-checked-what-when is preserved.
   */
  async verifyCoordinates(id: string, input: VerifyCoordinatesInput, userId: string | undefined, scope: TenantScope) {
    const existing = await this.getById(id, scope);
    const previous = {
      latitude: existing.latitude,
      longitude: existing.longitude,
    };

    let location = existing;
    if (input.result === 'CORRECTED') {
      location = {
        ...existing,
        ...(await this.repo.update(
          id,
          { latitude: input.latitude, longitude: input.longitude },
          userId
        )),
      };
    }

    await recordAuditLog({
      entityType: 'location',
      entityId: id,
      // A confirmation does not mutate data → STATUS_CHANGE; a correction does.
      action: input.result === 'CORRECTED' ? 'UPDATE' : 'STATUS_CHANGE',
      oldValue: { ...previous, field: 'coordinates' },
      newValue: {
        field: 'coordinates',
        verification: input.result,
        latitude: input.result === 'CORRECTED' ? input.latitude : previous.latitude,
        longitude: input.result === 'CORRECTED' ? input.longitude : previous.longitude,
        accuracyMeters: input.accuracy ?? null,
        note: input.note ?? null,
        verifiedAt: new Date().toISOString(),
      },
      performedBy: userId ?? null,
    });

    return {
      ...location,
      verification: {
        result: input.result,
        verifiedAt: new Date().toISOString(),
        verifiedBy: userId ?? null,
      },
    };
  }
}

export const locationService = new LocationService();
