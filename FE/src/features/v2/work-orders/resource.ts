// VoltHub — Work Order resource (Operation Management System GI RTUPP1).
//
// Backend (BE/src/modules/work-orders): list/get (any auth; PETUGAS auto-scoped
// to own/assigned WOs), create/update/assign/approve/reject/close/reopen/delete
// (WRITE_ROLES), start/submit (REPORT_WRITE — assignee). woNumber auto-generated.
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createResource } from "@/features/v2/createResource";
import { v2List, v2Get, v2Post, v2Upload, v2Delete, handleError } from "@/lib/api/v2";
import { WO_TYPES, TICKET_PRIORITIES } from "@/lib/v2/enums";
import type {
  WorkOrderType,
  WorkOrderStatus,
  TicketPriority,
  WorkResult,
  CbStatus,
} from "@/lib/v2/enums";
import type { LocationRef, UserRef } from "@/features/v2/inspections/resource";

export type { WorkOrderType, WorkOrderStatus } from "@/lib/v2/enums";

// Laporan wajib yang dicentang admin saat membuat WO.
// GI/HAR → lokasi GI (RTUPP1); INSPEKSI_GH/HAR_GH → lokasi GH (RTUPP2-5);
// INSPEKSI_MP/HAR_MP → lokasi GARDU / Metering Point (RTUPP2-5).
// BE menolak mismatch requiredReports↔tipe lokasi (422) — opsi FE per-tipe di bawah
// memastikan mismatch tak mungkin terkirim.
export const REQUIRED_REPORTS = ["GI", "HAR", "INSPEKSI_GH", "HAR_GH", "INSPEKSI_MP", "HAR_MP"] as const;
export type RequiredReport = (typeof REQUIRED_REPORTS)[number];
export const REQUIRED_REPORT_LABELS: Record<RequiredReport, string> = {
  GI: "Laporan GI",
  HAR: "Laporan HAR GI",
  INSPEKSI_GH: "Inspeksi GH",
  HAR_GH: "Laporan HAR GH",
  INSPEKSI_MP: "Inspeksi MP",
  HAR_MP: "Laporan HAR MP",
};
export const GI_REPORT_OPTIONS: { value: RequiredReport; label: string }[] = [
  { value: "GI", label: REQUIRED_REPORT_LABELS.GI },
  { value: "HAR", label: REQUIRED_REPORT_LABELS.HAR },
];
export const GH_REPORT_OPTIONS: { value: RequiredReport; label: string }[] = [
  { value: "INSPEKSI_GH", label: REQUIRED_REPORT_LABELS.INSPEKSI_GH },
  { value: "HAR_GH", label: REQUIRED_REPORT_LABELS.HAR_GH },
];
export const MP_REPORT_OPTIONS: { value: RequiredReport; label: string }[] = [
  { value: "INSPEKSI_MP", label: REQUIRED_REPORT_LABELS.INSPEKSI_MP },
  { value: "HAR_MP", label: REQUIRED_REPORT_LABELS.HAR_MP },
];
/** @deprecated gunakan GI_REPORT_OPTIONS / GH_REPORT_OPTIONS sesuai tipe lokasi. */
export const REQUIRED_REPORT_OPTIONS = GI_REPORT_OPTIONS;

export interface WoRef {
  id: string;
  code?: string | null;
  name?: string | null;
}
export interface LaporanRef {
  id: string;
  reportId: string;
  status: string | null;
}

export interface WorkOrder {
  id: string;
  woNumber: string;
  type: WorkOrderType;
  status: WorkOrderStatus;
  priority: TicketPriority;
  title: string;
  description: string | null;
  locationId: string;
  bayId: string | null;
  feederId: string | null;
  assetId: string | null;
  teamId: string | null;
  scadaEventRef: string | null;
  dueDate: string | null;
  revisionNote: string | null;
  // Laporan WO — hasil penyelesaian (menggantikan Laporan Akhir)
  hasilRC: WorkResult | null;
  hasilLR: WorkResult | null;
  hasilES: WorkResult | null;
  statusCB: CbStatus | null;
  penyebab: string | null;
  tindakan: string | null;
  rekomendasi: string | null;
  startedAt: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  closedAt: string | null;
  createdAt?: string;
  location?: LocationRef;
  bay?: WoRef | null;
  feeder?: { id: string; feederCode?: string; feederName?: string } | null;
  asset?: { id: string; assetCode?: string; assetName?: string } | null;
  team?: WoRef | null;
  createdBy?: UserRef | null;
  laporanAwal?: LaporanRef[];
  laporanAkhir?: LaporanRef[];
  laporanGi?: LaporanRef[];
  requiredReports?: RequiredReport[] | null;
}

export interface WorkOrderParams extends Record<string, unknown> {
  page?: number;
  limit?: number;
  search?: string;
  status?: WorkOrderStatus;
  type?: WorkOrderType;
  priority?: TicketPriority;
  locationId?: string;
  teamId?: string;
  mine?: boolean;
  overdue?: boolean;
}

export interface CreateWorkOrder {
  type: WorkOrderType;
  title: string;
  description?: string | null;
  priority?: TicketPriority;
  locationId: string;
  bayId?: string | null;
  feederId?: string | null;
  assetId?: string | null;
  teamId: string;
  dueDate?: string | null;
  scadaEventRef?: string | null;
  requiredReports?: RequiredReport[];
}

export type UpdateWorkOrder = Partial<
  Pick<
    CreateWorkOrder,
    "title" | "description" | "priority" | "bayId" | "feederId" | "assetId" | "dueDate" | "scadaEventRef" | "requiredReports"
  >
>;

export const workOrders = createResource<
  WorkOrder,
  WorkOrder,
  CreateWorkOrder,
  UpdateWorkOrder,
  WorkOrderParams
>({
  key: "v2-work-orders",
  path: "/work-orders",
  labels: { entity: "Work Order" },
});

// ── Lifecycle transitions (POST /work-orders/:id/<action>) ────────────────────
type Transition = "assign" | "start" | "submit" | "approve" | "reject" | "close" | "reopen";

export function useWorkOrderTransition(action: Transition) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body?: Record<string, unknown> }) =>
      v2Post<WorkOrder>(`/work-orders/${id}/${action}`, body ?? {}),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ["v2-work-orders", "list"] });
      qc.invalidateQueries({ queryKey: ["v2-work-orders", "detail", id] });
    },
    onError: (e) => toast.error(handleError(e as never)),
  });
}

// ── Laporan WO result (hasil penyelesaian) + photos ──────────────────────────
export interface WorkOrderResult {
  hasilRC?: WorkResult | null;
  hasilLR?: WorkResult | null;
  hasilES?: WorkResult | null;
  statusCB?: CbStatus | null;
  penyebab?: string | null;
  tindakan?: string | null;
  rekomendasi?: string | null;
  assetId?: string | null;
}

export interface WorkOrderPhoto {
  id: string;
  workOrderId: string;
  originalName: string;
  fileName: string;
  mimeType: string;
  size: number;
  path: string;
  category: string | null;
  uploadedAt: string;
}

/** Save the Laporan WO result without submitting (draft progress). */
export function useSaveWorkOrderResult() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: WorkOrderResult }) =>
      v2Post<WorkOrder>(`/work-orders/${id}/result`, body),
    onSuccess: (_d, { id }) => {
      toast.success("Laporan WO disimpan");
      qc.invalidateQueries({ queryKey: ["v2-work-orders", "detail", id] });
    },
    onError: (e) => toast.error(handleError(e as never)),
  });
}

export function useWorkOrderPhotos(id: string | undefined) {
  return useQuery({
    queryKey: ["v2-work-orders", "photos", id],
    queryFn: () => v2Get<WorkOrderPhoto[]>(`/work-orders/${id}/photos`),
    enabled: !!id,
  });
}

export function useUploadWorkOrderPhotos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, files, category }: { id: string; files: File[]; category?: string }) => {
      const form = new FormData();
      files.forEach((f) => form.append("files", f));
      if (category) form.append("category", category);
      return v2Upload<WorkOrderPhoto[]>(`/work-orders/${id}/photos`, form);
    },
    onSuccess: (_d, { id }) => {
      toast.success("Foto WO diunggah");
      qc.invalidateQueries({ queryKey: ["v2-work-orders", "photos", id] });
    },
    onError: (e) => toast.error(handleError(e as never)),
  });
}

export function useDeleteWorkOrderPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, attachmentId }: { id: string; attachmentId: string }) =>
      v2Delete(`/work-orders/${id}/photos/${attachmentId}`),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ["v2-work-orders", "photos", id] });
    },
    onError: (e) => toast.error(handleError(e as never)),
  });
}

// ── Summary stats (counts by lifecycle bucket) for dashboard cards ────────────
export interface WorkOrderStats {
  open: number; // DRAFT + ASSIGNED + ON_PROGRESS
  waiting: number; // WAITING_APPROVAL
  closed: number; // CLOSED
  rejected: number; // REJECTED ("Tidak Sesuai", terminal)
  overdue: number;
  total: number;
}

export function useWorkOrderStats(params?: WorkOrderParams) {
  const base = { ...params, page: 1, limit: 1 } as WorkOrderParams;
  const count = async (extra: WorkOrderParams) =>
    (await v2List<WorkOrder>("/work-orders", { ...base, ...extra })).meta.total;
  return useQuery({
    queryKey: ["v2-work-orders", "stats", params ?? {}],
    queryFn: async (): Promise<WorkOrderStats> => {
      const [draft, assigned, progress, waiting, closed, rejected, overdue, total] = await Promise.all([
        count({ status: "DRAFT" }),
        count({ status: "ASSIGNED" }),
        count({ status: "ON_PROGRESS" }),
        count({ status: "WAITING_APPROVAL" }),
        count({ status: "CLOSED" }),
        count({ status: "REJECTED" }),
        count({ overdue: true }),
        count({}),
      ]);
      return { open: draft + assigned + progress, waiting, closed, rejected, overdue, total };
    },
  });
}

// ── Operational dashboard summary (single backend aggregate endpoint) ─────────
export interface ChecklistOutcome {
  berhasil: number;
  gagal: number;
  total: number;
  successRate: number;
}
export interface WorkOrderTeamStat {
  teamId: string;
  teamName: string;
  total: number;
  closed: number;
  successRate: number;
}
export interface WorkOrderSummary {
  total: number;
  open: number;
  waiting: number;
  approved: number;
  closed: number;
  rejected: number;
  overdue: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  byTeam: WorkOrderTeamStat[];
  checklist: { rc: ChecklistOutcome; lr: ChecklistOutcome; es: ChecklistOutcome };
}

export function useWorkOrderSummary() {
  return useQuery({
    queryKey: ["v2-work-orders", "summary"],
    queryFn: () => v2Get<WorkOrderSummary>("/work-orders/stats/summary"),
  });
}

// ── Activity history (canonical audit trail, entityType=WorkOrder) ────────────
export interface WoAuditLog {
  id: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "STATUS_CHANGE";
  performedAt: string;
  performer?: UserRef | null;
}
export function useWorkOrderActivity(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["v2-work-orders", "activity", id],
    queryFn: () =>
      v2List<WoAuditLog>("/audit-logs", { entityType: "WorkOrder", entityId: id, limit: 50 }),
    enabled: !!id && enabled,
  });
}

const nullableString = z
  .string()
  .nullish()
  .transform((val) => (val === "" ? null : val));

// ── Validation (create/edit form) ─────────────────────────────────────────────
export const workOrderSchema = z.object({
  type: z.enum(WO_TYPES),
  title: z.string().min(1, "Judul pekerjaan wajib diisi").max(255),
  description: z.string().nullish().transform((val) => (val === "" ? null : val)),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  locationId: z.string().min(1, "GI wajib dipilih"),
  bayId: nullableString,
  feederId: nullableString,
  assetId: nullableString,
  teamId: z.string().min(1, "Tim Pelaksana wajib dipilih"),
  dueDate: z.string().nullish(),
  scadaEventRef: z.string().nullish().transform((val) => (val === "" ? null : val)),
  // Laporan wajib (GI/RTUPP1): minimal 1 dipilih.
  requiredReports: z
    .array(z.enum(REQUIRED_REPORTS))
    .min(1, "Pilih minimal 1 laporan yang harus diisi"),
});

export type WorkOrderFormValues = z.infer<typeof workOrderSchema>;

export const emptyWorkOrder: WorkOrderFormValues = {
  type: "CORRECTIVE",
  title: "",
  description: "",
  priority: "MEDIUM",
  locationId: "",
  bayId: null,
  feederId: null,
  assetId: null,
  teamId: "",
  dueDate: null,
  scadaEventRef: "",
  requiredReports: ["GI"],
};
