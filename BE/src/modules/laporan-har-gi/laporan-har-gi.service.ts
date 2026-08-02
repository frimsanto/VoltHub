import { Prisma } from '@prisma/client';
import { laporanHarGiRepository, LaporanHarGiRepository } from './laporan-har-gi.repository';
import {
  BusinessRuleError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../utils/appError';
import { recordAuditLog } from '../../utils/auditLog';
import { workOrderService } from '../work-orders/work-order.service';
import { assertLaporanAwalSubmitted } from '../work-orders/work-order-report-gates';
import { assertWoNotRejected } from '../work-orders/work-order-lock.helper';
import { isFieldOfficer } from '../../auth/roles';
import { rtuppInScope, type TenantScope } from '../../utils/tenantScope';
import type {
  CreateLaporanHarGiInput,
  UpdateLaporanHarGiInput,
  DecideLaporanHarGiInput,
  ListLaporanHarGiQuery,
} from './laporan-har-gi.validation';

export interface Actor {
  userId?: string;
  role?: string | null;
}

/** Section JSON payload keys (Json columns on LaporanHarGi). */
const SECTION_KEYS = ['io', 'relay', 'rectifier', 'baterai', 'serialDevice', 'cctv', 'penanganan'] as const;

/** Promoted scalar columns (status inti HAR). */
const SCALAR_KEYS = ['statusGarduSebelum', 'statusGarduSesudah', 'statusPekerjaan'] as const;

const asJson = (v: unknown): Prisma.InputJsonValue | undefined =>
  v == null ? undefined : (v as Prisma.InputJsonValue);

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

const nonEmptyStr = (v: unknown): boolean => typeof v === 'string' && v.trim() !== '';

export class LaporanHarGiService {
  constructor(private readonly repo: LaporanHarGiRepository = laporanHarGiRepository) {}

  async list(query: ListLaporanHarGiQuery, actor: Actor, scope: TenantScope) {
    const restrictToUserId =
      isFieldOfficer(actor.role) || query.mine ? actor.userId ?? null : null;
    const { data, total, page, limit } = await this.repo.findAll(query, scope, { restrictToUserId });
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getById(id: string, actor: Actor, scope: TenantScope) {
    const report = await this.repo.findById(id, scope);
    if (!report) throw new NotFoundError('Laporan HAR GI tidak ditemukan');
    if (isFieldOfficer(actor.role) && report.inspectorId !== actor.userId) {
      throw new ForbiddenError('Laporan HAR GI ini bukan milik Anda');
    }
    return report;
  }

  /** Resolve identitas (authoritative) — WAJIB ber-WO (identitas dari WO). */
  private async resolveIdentity(
    input: { workOrderId: string; feederId?: string | null; pelaksana?: string | null },
    scope: TenantScope,
  ) {
    const wo = await this.repo.workOrderById(input.workOrderId, scope);
    if (!wo) throw new NotFoundError('Work Order tidak ditemukan / di luar RTUPP Anda');
    if (!rtuppInScope(scope, wo.location?.rtuppId ?? null)) {
      throw new ForbiddenError('Work Order tersebut berada di luar RTUPP Anda');
    }
    if (wo.location?.locationType !== 'GI') {
      throw new BusinessRuleError('Laporan HAR GI harus berakar pada lokasi bertipe GI');
    }

    const locationId = wo.locationId;
    // feederId: default dari WO; bila FE mengirim, validasi milik GI ini.
    let feederId = wo.feederId ?? null;
    if (input.feederId) {
      if (!(await this.repo.feederExists(input.feederId, locationId))) {
        throw new ValidationError(`Penyulang "${input.feederId}" tidak ditemukan pada GI ini`);
      }
      feederId = input.feederId;
    }

    return {
      workOrderId: input.workOrderId,
      locationId,
      feederId,
      assetId: wo.assetId ?? null,
      up3: wo.location?.up3 ?? null,
      pelaksana: wo.team?.name ?? input.pelaksana ?? null,
      requiredReports: wo.requiredReports,
    };
  }

  private scalarData(input: Partial<Record<(typeof SCALAR_KEYS)[number], unknown>>) {
    const out: Record<string, unknown> = {};
    for (const k of SCALAR_KEYS) if (input[k] !== undefined) out[k] = input[k] ?? null;
    return out;
  }

  private sectionData(input: Partial<Record<(typeof SECTION_KEYS)[number], unknown>>) {
    const out: Record<string, Prisma.InputJsonValue> = {};
    for (const k of SECTION_KEYS) {
      const v = asJson(input[k]);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }

  async create(input: CreateLaporanHarGiInput, actor: Actor, scope: TenantScope) {
    const id = await this.resolveIdentity(input, scope);
    await assertLaporanAwalSubmitted(id.workOrderId, id.requiredReports);

    const created = await this.repo.create({
      workOrderId: id.workOrderId,
      locationId: id.locationId,
      feederId: id.feederId,
      assetId: id.assetId,
      up3: id.up3,
      reportDate: input.reportDate,
      ketKunjungan: input.ketKunjungan ?? null,
      pelaksana: id.pelaksana,
      pengawas: input.pengawas ?? null,
      inspectorId: actor.userId ?? null,
      status: 'DRAFT',
      scadaRtuName: input.scadaRtuName ?? null,
      penyebabGangguan: asJson(input.penyebabGangguan),
      ...this.scalarData(input),
      ...this.sectionData(input),
      createdBy: actor.userId ?? null,
    });

    await recordAuditLog({
      entityType: 'LaporanHarGi',
      entityId: created.id,
      action: 'CREATE',
      newValue: created,
      performedBy: actor.userId,
    });
    return created;
  }

  async update(id: string, input: UpdateLaporanHarGiInput, actor: Actor, scope: TenantScope) {
    const current = await this.getById(id, actor, scope);
    assertWoNotRejected(current.workOrder?.status);
    if (!['DRAFT', 'REJECTED'].includes(current.status)) {
      throw new BusinessRuleError(`Laporan HAR GI berstatus ${current.status} tidak dapat diubah`);
    }
    if (input.feederId !== undefined && input.feederId && !(await this.repo.feederExists(input.feederId, current.locationId))) {
      throw new ValidationError(`Penyulang "${input.feederId}" tidak ditemukan pada GI ini`);
    }

    const updated = await this.repo.update(id, {
      ...(input.feederId !== undefined ? { feederId: input.feederId ?? null } : {}),
      ...(input.reportDate !== undefined ? { reportDate: input.reportDate } : {}),
      ...(input.pelaksana !== undefined ? { pelaksana: input.pelaksana ?? null } : {}),
      ...(input.pengawas !== undefined ? { pengawas: input.pengawas ?? null } : {}),
      ...(input.ketKunjungan !== undefined ? { ketKunjungan: input.ketKunjungan ?? null } : {}),
      ...(input.scadaRtuName !== undefined ? { scadaRtuName: input.scadaRtuName ?? null } : {}),
      ...(input.penyebabGangguan !== undefined ? { penyebabGangguan: asJson(input.penyebabGangguan) ?? Prisma.JsonNull } : {}),
      ...this.scalarData(input),
      ...this.sectionData(input),
      updatedBy: actor.userId ?? null,
    });

    await recordAuditLog({
      entityType: 'LaporanHarGi',
      entityId: id,
      action: 'UPDATE',
      oldValue: current,
      newValue: updated,
      performedBy: actor.userId,
    });
    return updated;
  }

  /**
   * Wajib minimal saat submit: status gardu sesudah + status pekerjaan + hasil
   * pekerjaan. Sisanya opsional (laporan korektif bervariasi).
   */
  private assertSubmittable(r: { statusGarduSesudah: unknown; statusPekerjaan: unknown; penanganan: unknown }) {
    const missing: string[] = [];
    if (!nonEmptyStr(r.statusGarduSesudah)) missing.push('Status Gardu Sesudah');
    if (!nonEmptyStr(r.statusPekerjaan)) missing.push('Status Pekerjaan');
    const hasil = isObj(r.penanganan) ? r.penanganan.hasil : undefined;
    if (!nonEmptyStr(hasil)) missing.push('Hasil Pekerjaan');
    if (missing.length > 0) {
      throw new ValidationError(`Wajib diisi sebelum mengirim: ${missing.join(', ')}`);
    }
  }

  /**
   * PETUGAS submit: DRAFT/REJECTED → SUBMITTED. Laporan HAR GI selalu ber-WO →
   * setelah ditandai SUBMITTED, panggil WO (advance-if-complete): WO maju ke
   * WAITING_APPROVAL hanya bila SEMUA laporan wajib (GI &/atau HAR) sudah ter-submit;
   * bila belum, WO tetap ON_PROGRESS tanpa error. HAR TIDAK menyentuh hasilRC
   * (tanpa resultMapping). Notifikasi submit dikirim oleh WO (workOrderWorkflow).
   */
  async submit(id: string, actor: Actor, scope: TenantScope) {
    const current = await this.getById(id, actor, scope);
    assertWoNotRejected(current.workOrder?.status);
    if (!['DRAFT', 'REJECTED'].includes(current.status)) {
      throw new BusinessRuleError(`Laporan HAR GI berstatus ${current.status} tidak dapat dikirim`);
    }
    this.assertSubmittable(current);

    const updated = await this.repo.update(id, {
      status: 'SUBMITTED',
      submittedAt: new Date(),
      updatedBy: actor.userId ?? null,
    });

    await recordAuditLog({
      entityType: 'LaporanHarGi',
      entityId: id,
      action: 'STATUS_CHANGE',
      oldValue: current,
      newValue: updated,
      performedBy: actor.userId,
    });

    // Satu jalur via WO (HAR tanpa resultMapping → tak menyentuh hasilRC).
    await workOrderService.onLinkedReportSubmitted(current.workOrderId, {}, actor, scope);

    return updated;
  }

  /**
   * ADMIN/MASTER decision standalone: SUBMITTED → VALIDATED | REJECTED.
   * Laporan HAR GI selalu ber-WO → approval dilakukan lewat Work Order (cascade,
   * di-wire LANGKAH 3). Endpoint ini menolak laporan ber-WO (satu jalur via WO).
   */
  async decide(id: string, input: DecideLaporanHarGiInput, actor: Actor, scope: TenantScope) {
    const current = await this.getById(id, actor, scope);
    if (current.workOrderId) {
      throw new BusinessRuleError('Approval Laporan HAR GI dilakukan di Work Order terkait');
    }
    if (current.status !== 'SUBMITTED') {
      throw new BusinessRuleError(`Hanya laporan berstatus SUBMITTED yang dapat divalidasi (saat ini ${current.status})`);
    }

    const updated = await this.repo.update(id, {
      status: input.decision,
      validatedAt: new Date(),
      validatedBy: actor.userId ?? null,
      validationNote: input.validationNote ?? null,
      updatedBy: actor.userId ?? null,
    });

    await recordAuditLog({
      entityType: 'LaporanHarGi',
      entityId: id,
      action: 'STATUS_CHANGE',
      oldValue: current,
      newValue: updated,
      performedBy: actor.userId,
    });

    return updated;
  }
}

export const laporanHarGiService = new LaporanHarGiService();
