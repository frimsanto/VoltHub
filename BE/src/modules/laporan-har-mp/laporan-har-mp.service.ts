import { Prisma } from '@prisma/client';
import {
  laporanHarMpRepository,
  LaporanHarMpRepository,
  type ImportedHarMpRecord,
} from './laporan-har-mp.repository';
import {
  BusinessRuleError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../utils/appError';
import { recordAuditLog } from '../../utils/auditLog';
import { assertKubikelSubmittableMp } from '../laporan-inspeksi-mp/laporan-inspeksi-mp.service';
import { notificationDispatcher } from '../notifications/notification.dispatcher';
import { workOrderService } from '../work-orders/work-order.service';
import { assertLaporanAwalSubmitted } from '../work-orders/work-order-report-gates';
import { assertWoNotRejected } from '../work-orders/work-order-lock.helper';
import { isFieldOfficer } from '../../auth/roles';
import { rtuppInScope, type TenantScope } from '../../utils/tenantScope';
import type {
  CreateLaporanHarMpInput,
  UpdateLaporanHarMpInput,
  DecideLaporanHarMpInput,
  ListLaporanHarMpQuery,
} from './laporan-har-mp.validation';

export interface Actor {
  userId?: string;
  role?: string | null;
}

const SECTION_KEYS = [
  'supplyTr',
  'rectifier',
  'baterai',
  'rtu',
  'media1',
  'media2',
  'kubikel',
  'fdiRelay',
  'aco',
  'penanganan'
] as const;

// statusRc dibaca dari entri kubikel. Mendukung kubikel array (per-gardu; entri
// pertama sebagai promote scalar) maupun objek tunggal (kompat lama).
const primaryKubikel = (v: unknown): Record<string, unknown> | null => {
  if (Array.isArray(v)) return v.length > 0 && isObj(v[0]) ? (v[0] as Record<string, unknown>) : null;
  return isObj(v) ? v : null;
};

const asJson = (v: unknown): Prisma.InputJsonValue | undefined =>
  v == null ? undefined : (v as Prisma.InputJsonValue);

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

const isAbsent = (v: unknown): boolean => isObj(v) && v.tidakAda === true;

const hasKesimpulan = (v: unknown): boolean =>
  isObj(v) && typeof v.kesimpulan === 'string' && v.kesimpulan.trim() !== '';

export class LaporanHarMpService {
  constructor(private readonly repo: LaporanHarMpRepository = laporanHarMpRepository) {}

  async list(query: ListLaporanHarMpQuery, actor: Actor, scope: TenantScope) {
    const restrictToUserId =
      isFieldOfficer(actor.role) || query.mine ? actor.userId ?? null : null;

    // Data historis (import Excel, tanpa WO) hanya relevan utk riwayat umum: bukan
    // lookup per-WO, bukan filter status alur (imported tak punya keduanya), dan
    // bukan "punya saya" petugas (data historis tak berpemilik).
    const includeImported = !restrictToUserId && !query.workOrderId && !query.status;
    if (!includeImported) {
      const { data, total, page, limit } = await this.repo.findAll(query, scope, { restrictToUserId });
      return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
    }

    const { page, limit } = query;
    const [native, imported] = await Promise.all([
      this.repo.findAllUnpaged(query, scope, { restrictToUserId }),
      this.repo.findImported(query, scope),
    ]);

    const merged = [
      ...native.map((r) => ({ ...r, isImported: false as const })),
      ...imported.map((r) => this.mapImportedRow(r)),
    ].sort((a, b) => this.sortTime(b) - this.sortTime(a));

    const total = merged.length;
    const start = (page - 1) * limit;
    const data = merged.slice(start, start + limit);
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  private sortTime(r: { reportDate?: Date | null; createdAt?: Date | null }): number {
    return (r.reportDate ?? r.createdAt ?? new Date(0)).getTime();
  }

  // Baris "Laporan HAR MP" semu dari data historis import Excel — tidak pernah
  // punya WO/status alur (DRAFT/SUBMITTED/…), maka `status: null` dan FE
  // membedakan render lewat `isImported`.
  private mapImportedRow(r: ImportedHarMpRecord) {
    return {
      id: r.id,
      workOrderId: null,
      locationId: r.locationId,
      feederId: null,
      up3: r.up3,
      reportDate: r.tanggalPekerjaan,
      pelaksana: r.pelaksana,
      status: null,
      statusRc: r.statusRc,
      statusCubicle: null,
      statusCubicleMaster: null,
      statusLr: null,
      statusLrMaster: null,
      statusGarduSebelum: null,
      statusGarduSesudah: null,
      statusPekerjaan: r.statusPekerjaan,
      // Native menyimpan penyebabGangguan sbg array; sumber import berupa teks
      // tunggal — dibungkus 1-array agar bentuk API konsisten.
      penyebabGangguan: r.penyebabGangguan ? [r.penyebabGangguan] : null,
      location: r.location ?? (r.kodeGardu ? { id: r.locationId ?? '', code: r.kodeGardu, name: r.kodeGardu, up3: r.up3 } : null),
      feeder: null,
      inspector: null,
      workOrder: null,
      createdAt: r.createdAt,
      isImported: true as const,
      kodeGardu: r.kodeGardu,
      penyulang: r.penyulang,
      jenisPekerjaan: r.jenisPekerjaan,
      analisaGangguan: r.analisaGangguan,
      statusScada: r.statusScada,
      catatan: r.catatan,
      kesimpulanRectifier: r.kesimpulanRectifier,
      keteranganRectifier: r.keteranganRectifier,
      kesimpulanBaterai: r.kesimpulanBaterai,
      keteranganBaterai: r.keteranganBaterai,
      kesimpulanRtu: r.kesimpulanRtu,
      keteranganRtu: r.keteranganRtu,
      kesimpulanMedia: r.kesimpulanMedia,
      keteranganMedia: r.keteranganMedia,
    };
  }

  async getById(id: string, actor: Actor, scope: TenantScope) {
    const report = await this.repo.findById(id, scope);
    if (!report) throw new NotFoundError('Laporan HAR MP tidak ditemukan');
    if (isFieldOfficer(actor.role) && report.inspectorId !== actor.userId) {
      throw new ForbiddenError('Laporan HAR MP ini bukan milik Anda');
    }
    return report;
  }

  // workOrderId WAJIB. Identitas (locationId/feederId/up3/pelaksana) diambil dari WO
  // server-side — kiriman FE untuk field ini tidak dipercaya (anti-spoof).
  private async resolveIdentity(workOrderId: string, scope: TenantScope) {
    const wo = await this.repo.workOrderById(workOrderId, scope);
    if (!wo) throw new NotFoundError('Work Order tidak ditemukan / di luar RTUPP Anda');

    const loc = wo.location;
    if (!loc || !rtuppInScope(scope, loc.rtuppId)) {
      throw new ForbiddenError('Work Order tersebut berada di luar RTUPP Anda');
    }
    if (loc.locationType !== 'GARDU') {
      throw new BusinessRuleError('Laporan MP harus berakar pada Work Order berlokasi Gardu (GARDU)');
    }

    return {
      locationId: wo.locationId,
      feederId: loc.supplyFeederId ?? null,
      workOrderId,
      pelaksana: wo.team?.name ?? null,
      up3: loc.up3 ?? null,
      requiredReports: wo.requiredReports,
    };
  }

  private sectionData(input: Partial<Record<(typeof SECTION_KEYS)[number], unknown>>) {
    const out: Record<string, Prisma.InputJsonValue> = {};
    for (const k of SECTION_KEYS) {
      const v = asJson(input[k]);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }

  private syncScalars(kubikelVal: unknown) {
    const s = (v: unknown) => (typeof v === 'string' ? v : null);
    const out = {
      statusRc: null as string | null,
      statusCubicle: null as string | null,
      statusCubicleMaster: null as string | null,
      statusLr: null as string | null,
      statusLrMaster: null as string | null,
    };
    const k = primaryKubikel(kubikelVal);
    if (k) {
      out.statusCubicle = s(k.statusCubicle);
      out.statusCubicleMaster = s(k.statusCubicleMaster);
      out.statusLr = s(k.statusLr);
      out.statusLrMaster = s(k.statusLrMaster);
      out.statusRc = s(k.statusRc);
    }
    return out;
  }

  async create(input: CreateLaporanHarMpInput, actor: Actor, scope: TenantScope) {
    const id = await this.resolveIdentity(input.workOrderId, scope);
    await assertLaporanAwalSubmitted(id.workOrderId, id.requiredReports);
    const synced = this.syncScalars(input.kubikel);

    const created = await this.repo.create({
      locationId: id.locationId,
      feederId: id.feederId,
      workOrderId: id.workOrderId,
      up3: id.up3,
      reportDate: input.reportDate,
      pelaksana: id.pelaksana,
      inspectorId: actor.userId ?? null,
      status: 'DRAFT',
      statusGarduSebelum: input.statusGarduSebelum ?? null,
      statusGarduSesudah: input.statusGarduSesudah ?? null,
      statusPekerjaan: input.statusPekerjaan ?? null,
      penyebabGangguan: input.penyebabGangguan ? (input.penyebabGangguan as Prisma.InputJsonValue) : Prisma.DbNull,
      notes: input.notes ?? null,
      catatan: input.catatan ?? null,
      ...synced,
      ...this.sectionData(input),
      createdBy: actor.userId ?? null,
    });

    await recordAuditLog({
      entityType: 'LaporanHarMp',
      entityId: created.id,
      action: 'CREATE',
      newValue: created,
      performedBy: actor.userId,
    });
    return created;
  }

  async update(id: string, input: UpdateLaporanHarMpInput, actor: Actor, scope: TenantScope) {
    const current = await this.getById(id, actor, scope);
    assertWoNotRejected(current.workOrder?.status);
    if (!['DRAFT', 'REJECTED'].includes(current.status)) {
      throw new BusinessRuleError(`Laporan HAR MP berstatus ${current.status} tidak dapat diubah`);
    }

    const synced = this.syncScalars(
      input.kubikel !== undefined ? input.kubikel : current.kubikel,
    );

    const updated = await this.repo.update(id, {
      ...(input.reportDate !== undefined ? { reportDate: input.reportDate } : {}),
      ...(input.statusGarduSebelum !== undefined ? { statusGarduSebelum: input.statusGarduSebelum ?? null } : {}),
      ...(input.statusGarduSesudah !== undefined ? { statusGarduSesudah: input.statusGarduSesudah ?? null } : {}),
      ...(input.statusPekerjaan !== undefined ? { statusPekerjaan: input.statusPekerjaan ?? null } : {}),
      ...(input.penyebabGangguan !== undefined ? { penyebabGangguan: input.penyebabGangguan ? (input.penyebabGangguan as Prisma.InputJsonValue) : Prisma.DbNull } : {}),
      ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
      ...(input.catatan !== undefined ? { catatan: input.catatan ?? null } : {}),
      ...synced,
      ...this.sectionData(input),
      updatedBy: actor.userId ?? null,
    });

    await recordAuditLog({
      entityType: 'LaporanHarMp',
      entityId: id,
      action: 'UPDATE',
      oldValue: current,
      newValue: updated,
      performedBy: actor.userId,
    });
    return updated;
  }

  private assertSubmittable(r: {
    supplyTr: unknown; rectifier: unknown; baterai: unknown;
    rtu: unknown; media1: unknown; media2: unknown;
    kubikel: unknown; fdiRelay: unknown; aco: unknown;
    penanganan: unknown;
  }) {
    const missing: string[] = [];
    const need = (label: string, v: unknown) => {
      if (!hasKesimpulan(v)) missing.push(label);
    };

    if (!isAbsent(r.supplyTr)) need('Supply TR', r.supplyTr);
    need('Rectifier', r.rectifier);
    need('Baterai', r.baterai);
    need('RTU', r.rtu);
    need('Media 1', r.media1);
    if (!isAbsent(r.media2)) need('Media 2', r.media2);
    assertKubikelSubmittableMp(r.kubikel, missing);
    if (!isAbsent(r.fdiRelay)) need('FDI/Relay', r.fdiRelay);
    if (!isAbsent(r.aco)) need('ACO', r.aco);
    need('Penanganan', r.penanganan);

    if (missing.length > 0) {
      throw new ValidationError(`Data belum lengkap untuk section: ${missing.join(', ')}`);
    }
  }

  async submit(id: string, actor: Actor, scope: TenantScope) {
    const current = await this.getById(id, actor, scope);
    assertWoNotRejected(current.workOrder?.status);
    if (!['DRAFT', 'REJECTED'].includes(current.status)) {
      throw new BusinessRuleError(`Laporan HAR MP berstatus ${current.status} tidak dapat dikirim`);
    }
    this.assertSubmittable(current as any);

    const updated = await this.repo.update(id, {
      status: 'SUBMITTED',
      submittedAt: new Date(),
      updatedBy: actor.userId ?? null,
    });

    await recordAuditLog({
      entityType: 'LaporanHarMp',
      entityId: id,
      action: 'STATUS_CHANGE',
      oldValue: current,
      newValue: updated,
      performedBy: actor.userId,
    });

    // HAR MP korektif — SATU jalur via WO, TANPA resultMapping (tak menyentuh
    // hasilRC WO), sama pola HAR GH/LaporanHarGi. Notifikasi submit dikirim oleh WO.
    await workOrderService.onLinkedReportSubmitted(current.workOrderId, {}, actor, scope);

    return updated;
  }

  async decide(id: string, input: DecideLaporanHarMpInput, actor: Actor, scope: TenantScope) {
    const current = await this.getById(id, actor, scope);
    if (current.workOrderId) {
      throw new BusinessRuleError('Approval Laporan HAR MP tertaut Work Order dilakukan di Work Order terkait');
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
      entityType: 'LaporanHarMp',
      entityId: id,
      action: 'STATUS_CHANGE',
      oldValue: current,
      newValue: updated,
      performedBy: actor.userId,
    });

    notificationDispatcher.giReportWorkflow({
      action: input.decision === 'VALIDATED' ? 'APPROVE' : 'REJECT',
      reportId: updated.id,
      ref: updated.location?.code ?? updated.id,
      rtuppId: updated.location?.rtuppId,
      ownerId: updated.inspectorId,
      actorId: actor.userId,
      reason: input.validationNote,
    });

    return updated;
  }
}

export const laporanHarMpService = new LaporanHarMpService();
