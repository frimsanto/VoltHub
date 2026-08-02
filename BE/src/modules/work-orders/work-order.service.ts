import { randomUUID } from 'crypto';
import { WorkOrderStatus, WorkResult, CbStatus } from '@prisma/client';
import { workOrderRepository, WorkOrderRepository } from './work-order.repository';
import { laporanGiRepository } from '../laporan-gi/laporan-gi.repository';
import { laporanHarGiRepository } from '../laporan-har-gi/laporan-har-gi.repository';
import { laporanInspeksiGhRepository } from '../laporan-inspeksi-gh/laporan-inspeksi-gh.repository';
import { laporanHarGhRepository } from '../laporan-har-gh/laporan-har-gh.repository';
import { laporanInspeksiMpRepository } from '../laporan-inspeksi-mp/laporan-inspeksi-mp.repository';
import { laporanHarMpRepository } from '../laporan-har-mp/laporan-har-mp.repository';
import { ConflictError, NotFoundError, BusinessRuleError, ForbiddenError, ValidationError } from '../../utils/appError';
import { recordAuditLog } from '../../utils/auditLog';
import { notificationDispatcher } from '../notifications/notification.dispatcher';
import { isFieldOfficer, isAdmin } from '../../auth/roles';
import { assertTransition } from './work-order.transitions';
import { rtuppInScope, type TenantScope } from '../../utils/tenantScope';

/** Hasil uji manual dari Laporan GI yang dipetakan ke kolom Laporan WO. */
export interface GiResultMapping {
  hasilRC: WorkResult | null;
  hasilLR: WorkResult | null;
  hasilES: WorkResult | null;
  statusCB: CbStatus | null;
}
import type {
  CreateWorkOrderInput,
  UpdateWorkOrderInput,
  AssignWorkOrderInput,
  RejectWorkOrderInput,
  CloseWorkOrderInput,
  ListWorkOrderQuery,
  WorkOrderResultInput,
} from './work-order.validation';

/** Map the Laporan WO result input → Prisma update fields (omit undefined). */
function resultToData(input: WorkOrderResultInput): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of ['hasilRC', 'hasilLR', 'hasilES', 'statusCB', 'penyebab', 'tindakan', 'rekomendasi', 'assetId'] as const) {
    if (input[k] !== undefined) out[k] = input[k];
  }
  return out;
}

export interface Actor {
  userId?: string;
  role?: string | null;
}

/** Normalisasi requiredReports (JSON DB) → subset {GI,HAR,INSPEKSI_GH,HAR_GH,INSPEKSI_MP,HAR_MP} berurutan kanonik. */
function reqReportsOf(v: unknown): ('GI' | 'HAR' | 'INSPEKSI_GH' | 'HAR_GH' | 'INSPEKSI_MP' | 'HAR_MP')[] {
  if (!Array.isArray(v)) return [];
  return (['GI', 'HAR', 'INSPEKSI_GH', 'HAR_GH', 'INSPEKSI_MP', 'HAR_MP'] as const).filter((r) => (v as unknown[]).includes(r));
}

export class WorkOrderService {
  constructor(private readonly repo: WorkOrderRepository = workOrderRepository) {}

  async list(query: ListWorkOrderQuery, actor: Actor, scope: TenantScope) {
    // PETUGAS only sees WOs assigned to their team (own-records). `mine` also forces it.
    const restrictToTeamId =
      isFieldOfficer(actor.role) || query.mine
        ? actor.userId
          ? await this.repo.userTeamId(actor.userId)
          : null
        : null;

    // ADMIN's TenantScope is GLOBAL by data policy (hasGlobalScope), but the WO
    // list specifically must stay pinned to the admin's own RTUPP — narrow the
    // scope locally for this call only. MANAGER/MASTER/NOC and every other WO
    // action (getById/approve/stats/...) keep the caller's original scope.
    let listScope = scope;
    if (isAdmin(actor.role) && actor.userId) {
      const adminRtuppId = await this.repo.userRtuppId(actor.userId);
      if (adminRtuppId) listScope = { global: false, rtuppId: adminRtuppId };
    }

    const { data, total, page, limit } = await this.repo.findAll(query, listScope, { restrictToTeamId });
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getById(id: string, actor: Actor, scope: TenantScope) {
    const wo = await this.repo.findById(id, scope);
    if (!wo) throw new NotFoundError('Work Order not found');
    if (isFieldOfficer(actor.role) && !(await this.isAssignedToTeam(wo, actor.userId))) {
      throw new ForbiddenError('Work Order ini tidak ditugaskan kepada tim Anda');
    }
    return wo;
  }

  /** PETUGAS may act on a WO iff it's assigned to their own team. */
  private async isAssignedToTeam(wo: { teamId: string | null }, userId?: string): Promise<boolean> {
    if (!userId || !wo.teamId) return false;
    const userTeamId = await this.repo.userTeamId(userId);
    return !!userTeamId && userTeamId === wo.teamId;
  }

  // Validasi referensi + tipe lokasi. Mengembalikan locationType ('GI'|'GH') agar
  // caller (create) bisa menegakkan kecocokan requiredReports↔tipe lokasi.
  // Isolasi: fetch UNSCOPED utk membedakan 404 (tak ada) vs 403 (lintas-RTUPP);
  // guard eksplisit rtuppInScope (global → lolos). Pola sama LaporanGH resolveIdentity.
  private async validateRefs(
    input: { locationId: string; bayId?: string | null; feederId?: string | null; assetId?: string | null; teamId?: string | null },
    scope: TenantScope
  ): Promise<'GI' | 'GH' | 'GARDU'> {
    const location = await this.repo.locationExists(input.locationId);
    if (!location) throw new NotFoundError(`Lokasi "${input.locationId}" not found`);
    if (location.locationType !== 'GI' && location.locationType !== 'GH' && location.locationType !== 'GARDU') {
      throw new BusinessRuleError(
        'Work Order hanya untuk lokasi bertipe GI (Gardu Induk), GH (Gardu Hubung), atau GARDU (Gardu Distribusi/MP)',
      );
    }
    if (!rtuppInScope(scope, location.rtuppId)) {
      throw new ForbiddenError('Lokasi tersebut berada di luar RTUPP Anda');
    }
    if (input.bayId && !(await this.repo.bayExists(input.bayId, input.locationId))) {
      throw new ValidationError(`Bay "${input.bayId}" tidak ditemukan pada GI ini`);
    }
    if (input.feederId && !(await this.repo.feederExists(input.feederId, input.locationId))) {
      throw new ValidationError(`Penyulang "${input.feederId}" tidak ditemukan pada GI ini`);
    }
    if (input.assetId && !(await this.repo.assetExists(input.assetId, input.locationId))) {
      throw new ValidationError(`Asset "${input.assetId}" tidak ditemukan pada GI ini`);
    }
    if (input.teamId && !(await this.repo.teamExists(input.teamId))) {
      throw new NotFoundError(`Tim "${input.teamId}" not found`);
    }
    return location.locationType;
  }

  /**
   * Gate penyelesaian WO (ON_PROGRESS→WAITING_APPROVAL): kembalikan daftar laporan
   * wajib yang BELUM lengkap. WO legacy (requiredReports NULL/[]) → [] (lolos, perilaku lama).
   *   • "GI"  terpenuhi bila ada LaporanGi(workOrderId) berstatus SUBMITTED/VALIDATED.
   *   • "HAR" terpenuhi bila ada LaporanHarGi(workOrderId) berstatus SUBMITTED/VALIDATED
   *     (FASE B — pengecekan nyata; menggantikan placeholder FASE A2).
   */
  private async missingRequiredReports(wo: { id: string; requiredReports?: unknown }): Promise<string[]> {
    const req = reqReportsOf(wo.requiredReports);
    if (req.length === 0) return [];
    const missing: string[] = [];
    for (const r of req) {
      if (r === 'GI') {
        if (!(await this.repo.hasSubmittedGiReport(wo.id))) {
          missing.push('Laporan GI belum diisi / belum di-submit');
        }
      } else if (r === 'HAR') {
        if (!(await this.repo.hasSubmittedHarReport(wo.id))) {
          missing.push('Laporan HAR GI belum diisi / belum di-submit');
        }
      } else if (r === 'INSPEKSI_GH') {
        if (!(await this.repo.hasSubmittedInspeksiGhReport(wo.id))) {
          missing.push('Laporan Inspeksi GH belum diisi / belum di-submit');
        }
      } else if (r === 'HAR_GH') {
        if (!(await this.repo.hasSubmittedHarGhReport(wo.id))) {
          missing.push('Laporan HAR GH belum diisi / belum di-submit');
        }
      } else if (r === 'INSPEKSI_MP') {
        if (!(await this.repo.hasSubmittedInspeksiMpReport(wo.id))) {
          missing.push('Laporan Inspeksi MP belum diisi / belum di-submit');
        }
      } else if (r === 'HAR_MP') {
        if (!(await this.repo.hasSubmittedHarMpReport(wo.id))) {
          missing.push('Laporan HAR MP belum diisi / belum di-submit');
        }
      }
    }
    return missing;
  }

  /** Lempar bila ada laporan wajib yang belum lengkap (pesan spesifik per laporan). */
  private async assertRequiredReportsComplete(wo: { id: string; requiredReports?: unknown }) {
    const missing = await this.missingRequiredReports(wo);
    if (missing.length > 0) {
      throw new BusinessRuleError(
        `Tidak dapat diajukan approval — laporan wajib belum lengkap: ${missing.join('; ')}`,
      );
    }
  }

  // Prefix mengikuti tipe lokasi: WO-GI- (Gardu Induk) / WO-GH- (Gardu Hubung) /
  // WO-MP- (Gardu Distribusi/Metering Point). WO lama tidak diubah — hanya berlaku
  // untuk nomor baru.
  private async generateWoNumber(locationType: 'GI' | 'GH' | 'GARDU' = 'GI'): Promise<string> {
    const prefix = locationType === 'GARDU' ? 'MP' : locationType;
    const ym = new Date().toISOString().slice(0, 7).replace('-', '');
    for (let i = 0; i < 5; i += 1) {
      const candidate = `WO-${prefix}-${ym}-${randomUUID().slice(0, 6).toUpperCase()}`;
      if (!(await this.repo.findByNumber(candidate))) return candidate;
    }
    throw new ConflictError('Gagal membuat nomor Work Order unik');
  }

  async create(input: CreateWorkOrderInput, actor: Actor, scope: TenantScope) {
    const locationType = await this.validateRefs(input, scope);

    // Admin wajib mencentang minimal 1 laporan wajib.
    if (!input.requiredReports || input.requiredReports.length === 0) {
      throw new ValidationError('Pilih minimal 1 laporan yang harus diisi');
    }

    // Integritas: requiredReports HARUS cocok tipe lokasi, agar gate penyelesaian
    // bisa terpenuhi. GI → {GI,HAR} (RTUPP1); GH → {INSPEKSI_GH,HAR_GH} (RTUPP2-5);
    // GARDU → {INSPEKSI_MP,HAR_MP} (RTUPP2-5, Metering Point/Gardu Distribusi).
    // Campur (mis. lokasi GH minta GI) → 422; gate mustahil terpenuhi bila dibiarkan.
    const allowed = locationType === 'GI'
      ? (['GI', 'HAR'] as const)
      : locationType === 'GH'
        ? (['INSPEKSI_GH', 'HAR_GH'] as const)
        : (['INSPEKSI_MP', 'HAR_MP'] as const);
    const mismatched = input.requiredReports.filter((r) => !(allowed as readonly string[]).includes(r));
    if (mismatched.length > 0) {
      throw new ValidationError(
        `Laporan ${mismatched.join(', ')} tidak sesuai untuk lokasi tipe ${locationType} ` +
          `(hanya ${allowed.join(', ')} yang diizinkan)`,
      );
    }

    let woNumber = input.woNumber;
    if (woNumber) {
      if (await this.repo.findByNumber(woNumber)) {
        throw new ConflictError(`Nomor WO "${woNumber}" sudah ada`);
      }
    } else {
      woNumber = await this.generateWoNumber(locationType);
    }

    const created = await this.repo.create({
      woNumber,
      type: input.type,
      status: 'ASSIGNED',
      priority: input.priority,
      title: input.title,
      description: input.description ?? null,
      scadaEventRef: input.scadaEventRef ?? null,
      dueDate: input.dueDate ?? null,
      location: { connect: { id: input.locationId } },
      ...(input.bayId ? { bay: { connect: { id: input.bayId } } } : {}),
      ...(input.feederId ? { feeder: { connect: { id: input.feederId } } } : {}),
      ...(input.assetId ? { asset: { connect: { id: input.assetId } } } : {}),
      team: { connect: { id: input.teamId } },
      ...(input.scadaGarduId ? { scadaGardu: { connect: { id: input.scadaGarduId } } } : {}),
      ...(actor.userId ? { createdBy: { connect: { id: actor.userId } } } : {}),
      requiredReports: input.requiredReports,
    });

    await recordAuditLog({
      entityType: 'WorkOrder',
      entityId: created.id,
      action: 'CREATE',
      newValue: created,
      performedBy: actor.userId,
    });

    const teamMemberIds = await this.repo.teamMemberIds(input.teamId);
    notificationDispatcher.taskAssignedTeam({
      recipientIds: teamMemberIds,
      actorId: actor.userId,
      entityType: 'WorkOrder',
      entityId: created.id,
      ref: created.woNumber,
      detail: [created.type, created.priority].filter(Boolean).join(' · ') || null,
    });
    return created;
  }

  async update(id: string, input: UpdateWorkOrderInput, actor: Actor, scope: TenantScope) {
    const current = await this.getById(id, actor, scope);
    if (!['DRAFT', 'ASSIGNED'].includes(current.status)) {
      throw new ForbiddenError(
        `Work Order berstatus ${current.status} tidak dapat diedit — pekerjaan sudah berjalan`,
      );
    }
    if (input.bayId && !(await this.repo.bayExists(input.bayId, current.locationId))) {
      throw new ValidationError(`Bay "${input.bayId}" tidak ditemukan pada GI ini`);
    }
    if (input.feederId && !(await this.repo.feederExists(input.feederId, current.locationId))) {
      throw new ValidationError(`Penyulang "${input.feederId}" tidak ditemukan pada GI ini`);
    }
    if (input.assetId && !(await this.repo.assetExists(input.assetId, current.locationId))) {
      throw new ValidationError(`Asset "${input.assetId}" tidak ditemukan pada GI ini`);
    }
    // Laporan wajib: bila dikirim, harus tetap ≥1 (tak boleh dikosongkan).
    if (input.requiredReports !== undefined && input.requiredReports.length === 0) {
      throw new ValidationError('Pilih minimal 1 laporan yang harus diisi (Laporan GI / Laporan HAR GI)');
    }
    const updated = await this.repo.update(id, {
      ...(input.requiredReports !== undefined ? { requiredReports: input.requiredReports } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
      ...(input.scadaEventRef !== undefined ? { scadaEventRef: input.scadaEventRef } : {}),
      ...(input.bayId !== undefined
        ? { bay: input.bayId ? { connect: { id: input.bayId } } : { disconnect: true } }
        : {}),
      ...(input.feederId !== undefined
        ? { feeder: input.feederId ? { connect: { id: input.feederId } } : { disconnect: true } }
        : {}),
      ...(input.assetId !== undefined
        ? { asset: input.assetId ? { connect: { id: input.assetId } } : { disconnect: true } }
        : {}),
    });
    await recordAuditLog({
      entityType: 'WorkOrder',
      entityId: id,
      action: 'UPDATE',
      oldValue: current,
      newValue: updated,
      performedBy: actor.userId,
    });
    return updated;
  }

  async assign(id: string, input: AssignWorkOrderInput, actor: Actor, scope: TenantScope) {
    const current = await this.getById(id, actor, scope);
    if (['APPROVED', 'CLOSED', 'REJECTED'].includes(current.status)) {
      throw new BusinessRuleError(`Work Order berstatus ${current.status} tidak dapat ditugaskan ulang`);
    }
    if (!(await this.repo.teamExists(input.teamId))) {
      throw new NotFoundError(`Tim "${input.teamId}" not found`);
    }
    const teamRtuppId = await this.repo.teamRtuppId(input.teamId);
    if (!rtuppInScope(scope, teamRtuppId)) {
      throw new ForbiddenError('Tim tersebut berada di luar RTUPP Anda');
    }

    // Assigning moves DRAFT → ASSIGNED (an in-progress WO stays as-is).
    const nextStatus: WorkOrderStatus = current.status === 'DRAFT' ? 'ASSIGNED' : current.status;

    const updated = await this.repo.update(id, {
      team: { connect: { id: input.teamId } },
      status: nextStatus,
    });

    await recordAuditLog({
      entityType: 'WorkOrder',
      entityId: id,
      action: 'STATUS_CHANGE',
      oldValue: current,
      newValue: updated,
      performedBy: actor.userId,
    });

    const teamMemberIds = await this.repo.teamMemberIds(input.teamId);
    notificationDispatcher.taskAssignedTeam({
      recipientIds: teamMemberIds,
      actorId: actor.userId,
      entityType: 'WorkOrder',
      entityId: id,
      ref: updated.woNumber,
      detail: [updated.type, updated.priority].filter(Boolean).join(' · ') || null,
    });
    return updated;
  }

  /** Generic status transition with guard + audit. */
  private async transition(
    id: string,
    to: WorkOrderStatus,
    actor: Actor,
    scope: TenantScope,
    extra: Record<string, unknown> = {},
    opts: { requireAssignee?: boolean } = {}
  ) {
    const current = await this.getById(id, actor, scope);
    if (opts.requireAssignee && !(await this.isAssignedToTeam(current, actor.userId))) {
      throw new ForbiddenError('Hanya petugas dari tim yang ditugaskan yang dapat melakukan aksi ini');
    }
    assertTransition(current.status, to);
    const updated = await this.repo.update(id, { status: to, ...extra });
    await recordAuditLog({
      entityType: 'WorkOrder',
      entityId: id,
      action: 'STATUS_CHANGE',
      oldValue: current,
      newValue: updated,
      performedBy: actor.userId,
    });
    return updated;
  }

  /** PETUGAS starts work: ASSIGNED → ON_PROGRESS. */
  start(id: string, actor: Actor, scope: TenantScope) {
    return this.transition(id, 'ON_PROGRESS', actor, scope, { startedAt: new Date() }, { requireAssignee: !!actor.role && isFieldOfficer(actor.role) });
  }

  /**
   * PETUGAS saves the Laporan WO result without submitting (draft progress).
   * Allowed while the WO is still in execution.
   */
  async saveResult(id: string, input: WorkOrderResultInput, actor: Actor, scope: TenantScope) {
    const current = await this.getById(id, actor, scope);
    if (isFieldOfficer(actor.role) && !(await this.isAssignedToTeam(current, actor.userId))) {
      throw new ForbiddenError('Hanya petugas dari tim yang ditugaskan yang dapat mengisi laporan WO');
    }
    if (!['ASSIGNED', 'ON_PROGRESS', 'WAITING_APPROVAL'].includes(current.status)) {
      throw new BusinessRuleError(`Laporan WO tidak dapat diubah pada status ${current.status}`);
    }
    if (input.assetId && !(await this.repo.assetExists(input.assetId, current.locationId))) {
      throw new ValidationError(`Asset "${input.assetId}" tidak ditemukan pada GI ini`);
    }
    const updated = await this.repo.update(id, resultToData(input));
    await recordAuditLog({
      entityType: 'WorkOrder',
      entityId: id,
      action: 'UPDATE',
      oldValue: current,
      newValue: updated,
      performedBy: actor.userId,
    });
    return updated;
  }

  /**
   * PETUGAS submits for approval: ON_PROGRESS → WAITING_APPROVAL, persisting the
   * Laporan WO result (hasil RC/LR/ES/CB + penyebab/tindakan/rekomendasi) in the
   * same call. The WO itself is the completion report (replaces Laporan Akhir).
   */
  async submit(id: string, input: WorkOrderResultInput, actor: Actor, scope: TenantScope) {
    const current = await this.getById(id, actor, scope);
    if (input.assetId && !(await this.repo.assetExists(input.assetId, current.locationId))) {
      throw new ValidationError(`Asset "${input.assetId}" tidak ditemukan pada GI ini`);
    }
    // Gate penyelesaian: semua laporan wajib harus lengkap & ter-submit.
    await this.assertRequiredReportsComplete(current);
    const updated = await this.transition(
      id,
      'WAITING_APPROVAL',
      actor,
      scope,
      { submittedAt: new Date(), ...resultToData(input) },
      { requireAssignee: !!actor.role && isFieldOfficer(actor.role) },
    );

    notificationDispatcher.workOrderWorkflow({
      action: 'SUBMIT',
      workOrderId: updated.id,
      woNumber: updated.woNumber,
      rtuppId: updated.location?.rtuppId,
      actorId: actor.userId,
    });

    return updated;
  }

  /**
   * Dipanggil saat sebuah laporan wajib ber-WO (Laporan GI / HAR GI) di-SUBMIT.
   * Laporan pemicu sudah berstatus SUBMITTED saat metode ini dipanggil (di-set oleh
   * service laporan masing-masing). Alur "advance-if-complete":
   *   1. (GI) petakan hasil uji MANUAL (RC/LR/ES/CB) ke WO. HAR TIDAK menyentuh hasilRC.
   *   2. Pastikan WO minimal ON_PROGRESS (mulai dikerjakan).
   *   3. Cek gate requiredReports:
   *        • SEMUA laporan wajib sudah ter-submit → WO OTOMATIS maju WAITING_APPROVAL + notif.
   *        • Belum lengkap → WO TETAP ON_PROGRESS, TANPA error (laporan lain menyusul).
   * Satu jalur approval via WO. Dipanggil service→service satu arah (GI/HAR → WO).
   */
  async onLinkedReportSubmitted(
    id: string,
    opts: { resultMapping?: GiResultMapping },
    actor: Actor,
    scope: TenantScope,
  ) {
    const current = await this.getById(id, actor, scope); // own-assignee guard utk PETUGAS
    if (['WAITING_APPROVAL', 'APPROVED', 'CLOSED', 'REJECTED'].includes(current.status)) {
      throw new BusinessRuleError(`Work Order berstatus ${current.status} tidak dapat menerima laporan`);
    }
    // Pastikan ON_PROGRESS dulu (DRAFT/ASSIGNED/REJECTED → ON_PROGRESS diizinkan guard).
    if (current.status !== 'ON_PROGRESS') {
      assertTransition(current.status, 'ON_PROGRESS');
    }

    const resultData = opts.resultMapping
      ? {
          hasilRC: opts.resultMapping.hasilRC,
          hasilLR: opts.resultMapping.hasilLR,
          hasilES: opts.resultMapping.hasilES,
          statusCB: opts.resultMapping.statusCB,
        }
      : {};
    const startedData = current.startedAt ? {} : { startedAt: new Date() };

    // Gate dievaluasi SETELAH laporan pemicu SUBMITTED → kelengkapan tercermin.
    const missing = await this.missingRequiredReports(current);

    if (missing.length === 0) {
      // Semua laporan wajib lengkap → WO maju ke approval.
      assertTransition('ON_PROGRESS', 'WAITING_APPROVAL');
      const updated = await this.repo.update(id, {
        ...resultData,
        ...startedData,
        status: 'WAITING_APPROVAL',
        submittedAt: new Date(),
      });
      await recordAuditLog({
        entityType: 'WorkOrder',
        entityId: id,
        action: 'STATUS_CHANGE',
        oldValue: current,
        newValue: updated,
        performedBy: actor.userId,
      });
      notificationDispatcher.workOrderWorkflow({
        action: 'SUBMIT',
        workOrderId: updated.id,
        woNumber: updated.woNumber,
        rtuppId: updated.location?.rtuppId,
        actorId: actor.userId,
      });
      return updated;
    }

    // Belum lengkap → simpan hasil (bila ada) + pastikan ON_PROGRESS, TANPA maju/notif.
    const updated = await this.repo.update(id, {
      ...resultData,
      ...startedData,
      status: 'ON_PROGRESS',
    });
    await recordAuditLog({
      entityType: 'WorkOrder',
      entityId: id,
      action: 'UPDATE',
      oldValue: current,
      newValue: updated,
      performedBy: actor.userId,
    });
    return updated;
  }

  /** ADMIN/MASTER approves: WAITING_APPROVAL → APPROVED. */
  async approve(id: string, actor: Actor, scope: TenantScope) {
    const updated = await this.transition(id, 'APPROVED', actor, scope, {
      approvedAt: new Date(),
      ...(actor.userId ? { approvedBy: { connect: { id: actor.userId } } } : {}),
    });

    // Cascade ke Laporan GI & HAR GI tertaut (mirror): SUBMITTED → VALIDATED.
    await laporanGiRepository.cascadeStatusByWorkOrder(updated.id, 'VALIDATED', null, actor.userId);
    await laporanHarGiRepository.cascadeStatusByWorkOrder(updated.id, 'VALIDATED', null, actor.userId);
    // Cascade ke Laporan Inspeksi GH & HAR GH tertaut.
    await laporanInspeksiGhRepository.cascadeStatusByWorkOrder(updated.id, 'VALIDATED', null, actor.userId);
    await laporanHarGhRepository.cascadeStatusByWorkOrder(updated.id, 'VALIDATED', null, actor.userId);
    // Cascade ke Laporan Inspeksi MP & HAR MP tertaut.
    await laporanInspeksiMpRepository.cascadeStatusByWorkOrder(updated.id, 'VALIDATED', null, actor.userId);
    await laporanHarMpRepository.cascadeStatusByWorkOrder(updated.id, 'VALIDATED', null, actor.userId);

    notificationDispatcher.workOrderWorkflow({
      action: 'APPROVE',
      workOrderId: updated.id,
      woNumber: updated.woNumber,
      rtuppId: updated.location?.rtuppId,
      ownerIds: updated.teamId ? await this.repo.teamMemberIds(updated.teamId) : [],
      actorId: actor.userId,
    });

    return updated;
  }

  /** ADMIN/MASTER rejects with revision note: WAITING_APPROVAL → REJECTED. */
  async reject(id: string, input: RejectWorkOrderInput, actor: Actor, scope: TenantScope) {
    const updated = await this.transition(id, 'REJECTED', actor, scope, {
      rejectedAt: new Date(),
      revisionNote: input.revisionNote,
      ...(actor.userId ? { rejectedBy: { connect: { id: actor.userId } } } : {}),
    });

    // Cascade ke Laporan GI & HAR GI tertaut (mirror): SUBMITTED → REJECTED + catatan.
    await laporanGiRepository.cascadeStatusByWorkOrder(updated.id, 'REJECTED', input.revisionNote, actor.userId);
    await laporanHarGiRepository.cascadeStatusByWorkOrder(updated.id, 'REJECTED', input.revisionNote, actor.userId);
    // Cascade ke Laporan Inspeksi GH & HAR GH tertaut.
    await laporanInspeksiGhRepository.cascadeStatusByWorkOrder(updated.id, 'REJECTED', input.revisionNote, actor.userId);
    await laporanHarGhRepository.cascadeStatusByWorkOrder(updated.id, 'REJECTED', input.revisionNote, actor.userId);
    // Cascade ke Laporan Inspeksi MP & HAR MP tertaut.
    await laporanInspeksiMpRepository.cascadeStatusByWorkOrder(updated.id, 'REJECTED', input.revisionNote, actor.userId);
    await laporanHarMpRepository.cascadeStatusByWorkOrder(updated.id, 'REJECTED', input.revisionNote, actor.userId);

    notificationDispatcher.workOrderWorkflow({
      action: 'REJECT',
      workOrderId: updated.id,
      woNumber: updated.woNumber,
      rtuppId: updated.location?.rtuppId,
      ownerIds: updated.teamId ? await this.repo.teamMemberIds(updated.teamId) : [],
      actorId: actor.userId,
      reason: input.revisionNote,
    });

    return updated;
  }

  /** ADMIN/MASTER closes an approved WO: APPROVED → CLOSED. */
  close(id: string, input: CloseWorkOrderInput, actor: Actor, scope: TenantScope) {
    return this.transition(id, 'CLOSED', actor, scope, {
      closedAt: new Date(),
      ...(input.notes ? { revisionNote: input.notes } : {}),
    });
  }

  /** ADMIN/MASTER reopens a closed WO: CLOSED → ON_PROGRESS. */
  reopen(id: string, actor: Actor, scope: TenantScope) {
    return this.transition(id, 'ON_PROGRESS', actor, scope, { closedAt: null });
  }

  /** Operational dashboard aggregates (WO buckets + RC/LR/ES success rate). */
  async stats(scope: TenantScope) {
    const [statusRows, typeRows, overdue, teamTotals, teamClosed, rc, lr, es] = await Promise.all([
      this.repo.statusCounts(scope),
      this.repo.typeCounts(scope),
      this.repo.overdueCount(scope),
      this.repo.teamTotals(scope),
      this.repo.teamClosed(scope),
      this.repo.checklistCounts(scope, 'hasilRC'),
      this.repo.checklistCounts(scope, 'hasilLR'),
      this.repo.checklistCounts(scope, 'hasilES'),
    ]);

    const byStatus: Record<string, number> = {};
    let total = 0;
    for (const r of statusRows) {
      byStatus[r.status] = r._count._all;
      total += r._count._all;
    }
    const byType: Record<string, number> = {};
    for (const r of typeRows) byType[r.type] = r._count._all;

    // Per-team rollup (total + closed → success/closure rate).
    const closedMap = new Map<string, number>();
    for (const r of teamClosed) if (r.teamId) closedMap.set(r.teamId, r._count._all);
    const teamIds = teamTotals.map((r) => r.teamId).filter((x): x is string => !!x);
    const teams = teamIds.length ? await this.repo.teamsByIds(teamIds) : [];
    const teamName = new Map(teams.map((t) => [t.id, t.name]));
    const byTeam = teamTotals
      .filter((r) => r.teamId)
      .map((r) => {
        const closed = closedMap.get(r.teamId as string) ?? 0;
        const totalT = r._count._all;
        return {
          teamId: r.teamId as string,
          teamName: teamName.get(r.teamId as string) ?? "—",
          total: totalT,
          closed,
          successRate: totalT ? Math.round((closed / totalT) * 100) : 0,
        };
      });

    const tally = (rows: { _count: { _all: number } }[], key: string) => {
      let berhasil = 0;
      let gagal = 0;
      for (const r of rows as Array<Record<string, unknown> & { _count: { _all: number } }>) {
        if (r[key] === 'BERHASIL') berhasil += r._count._all;
        else if (r[key] === 'GAGAL') gagal += r._count._all;
      }
      const t = berhasil + gagal;
      return { berhasil, gagal, total: t, successRate: t ? Math.round((berhasil / t) * 100) : 0 };
    };

    const open =
      (byStatus.DRAFT ?? 0) + (byStatus.ASSIGNED ?? 0) + (byStatus.ON_PROGRESS ?? 0);

    return {
      total,
      open,
      waiting: byStatus.WAITING_APPROVAL ?? 0,
      approved: byStatus.APPROVED ?? 0,
      closed: byStatus.CLOSED ?? 0,
      rejected: byStatus.REJECTED ?? 0,
      overdue,
      byStatus,
      byType,
      byTeam,
      checklist: {
        rc: tally(rc, 'hasilRC'),
        lr: tally(lr, 'hasilLR'),
        es: tally(es, 'hasilES'),
      },
    };
  }

  // ── Laporan WO attachments (foto sebelum/sesudah) ──
  async listPhotos(id: string, actor: Actor, scope: TenantScope) {
    await this.getById(id, actor, scope);
    return this.repo.listAttachments(id);
  }

  async addPhotos(
    id: string,
    files: { originalName: string; fileName: string; mimeType: string; size: number; path: string }[],
    category: string | null,
    actor: Actor,
    scope: TenantScope,
  ) {
    const current = await this.getById(id, actor, scope);
    if (isFieldOfficer(actor.role) && !(await this.isAssignedToTeam(current, actor.userId))) {
      throw new ForbiddenError('Hanya petugas dari tim yang ditugaskan yang dapat mengunggah foto WO');
    }
    if (files.length === 0) return this.repo.listAttachments(id);
    await this.repo.createAttachments(
      files.map((f) => ({ ...f, workOrderId: id, category, uploadedById: actor.userId ?? null })),
    );
    return this.repo.listAttachments(id);
  }

  async removePhoto(id: string, attachmentId: string, actor: Actor, scope: TenantScope) {
    await this.getById(id, actor, scope);
    const att = await this.repo.attachmentById(attachmentId);
    if (!att || att.workOrderId !== id) throw new NotFoundError('Foto tidak ditemukan');
    await this.repo.deleteAttachment(attachmentId);
  }

  async remove(id: string, actor: Actor, scope: TenantScope) {
    const current = await this.getById(id, actor, scope);
    await this.repo.softDelete(id);
    await recordAuditLog({
      entityType: 'WorkOrder',
      entityId: id,
      action: 'DELETE',
      oldValue: current,
      performedBy: actor.userId,
    });
  }
}

export const workOrderService = new WorkOrderService();
