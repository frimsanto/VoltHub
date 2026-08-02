// VoltHub — Inspeksi GH resource (Laporan preventif Gardu Hubung, RTUPP2-5).
// Backend: BE/src/modules/laporan-inspeksi-gh → /api/v1/gh/inspeksi. WAJIB ber-WO;
// identitas (locationId/feederId/up3/pelaksana) auto server-side dari WO.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createResource } from "@/features/v2/createResource";
import { v2Post, handleError } from "@/lib/api/v2";
import type { GiReportStatus } from "@/lib/v2/enums";
import type { KubikelEntry } from "@/features/v2/gh-shared/ghSections";

export interface LocationRef {
  id: string;
  code?: string | null;
  name?: string | null;
  locationType?: string | null;
  up3?: string | null;
}
export interface FeederRef {
  id: string;
  feederCode?: string | null;
  feederName?: string | null;
}
export interface UserRef {
  id: string;
  name?: string | null;
  email?: string | null;
}

type Section = Record<string, unknown> | null;

export interface InspeksiGhRow {
  id: string;
  workOrderId: string | null;
  locationId: string | null;
  feederId: string | null;
  up3: string | null;
  reportDate: string | null;
  pelaksana: string | null;
  status: GiReportStatus | null;
  statusRc: string | null;
  statusCubicle: string | null;
  statusCubicleMaster: string | null;
  statusLr: string | null;
  statusLrMaster: string | null;
  location?: LocationRef | null;
  feeder?: FeederRef | null;
  inspector?: UserRef | null;
  workOrder?: { id: string; woNumber?: string | null } | null;
  createdAt?: string;
  /** Baris historis dari import Excel (inspeksi_gardu_records) — bukan laporan alur WO. */
  isImported?: boolean;
  kodeGardu?: string | null;
  penyulang?: string | null;
  statusScada?: string | null;
  catatan?: string | null;
  kesimpulanRectifier?: string | null;
  keteranganRectifier?: string | null;
  kesimpulanBaterai?: string | null;
  keteranganBaterai?: string | null;
  kesimpulanRtu?: string | null;
  keteranganRtu?: string | null;
  kesimpulanMedia?: string | null;
  keteranganMedia?: string | null;
}

export interface InspeksiGhDetail extends InspeksiGhRow {
  supplyTr: Section;
  rectifier: Section;
  baterai: Section;
  rtu: Section;
  media1: Section;
  media2: Section;
  kubikel: KubikelEntry[] | null;
  fdiRelay: Section;
  aco: Section;
  notes: string | null;
  catatan: string | null;
  submittedAt: string | null;
  validatedAt: string | null;
  validatedBy: string | null;
  validationNote: string | null;
}

export interface InspeksiGhParams extends Record<string, unknown> {
  page?: number;
  limit?: number;
  locationId?: string;
  workOrderId?: string;
  status?: GiReportStatus;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  mine?: boolean;
}

export interface CreateInspeksiGh extends Record<string, unknown> {
  workOrderId: string;
  reportDate: string;
  supplyTr?: Section;
  rectifier?: Section;
  baterai?: Section;
  rtu?: Section;
  media1?: Section;
  media2?: Section;
  kubikel?: KubikelEntry[];
  fdiRelay?: Section;
  aco?: Section;
  notes?: string | null;
  catatan?: string | null;
}

export const inspeksiGh = createResource<
  InspeksiGhRow,
  InspeksiGhDetail,
  CreateInspeksiGh,
  Partial<CreateInspeksiGh>,
  InspeksiGhParams
>({
  key: "v2-inspeksi-gh",
  path: "/gh/inspeksi",
  labels: { entity: "Inspeksi GH" },
});

export function useSubmitInspeksiGh() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => v2Post<InspeksiGhDetail>(`/gh/inspeksi/${id}/submit`),
    onSuccess: (_d, id) => {
      toast.success("Laporan dikirim untuk validasi");
      qc.invalidateQueries({ queryKey: inspeksiGh.keys.lists() });
      qc.invalidateQueries({ queryKey: inspeksiGh.keys.detail(id) });
    },
    onError: (e) => toast.error(handleError(e as never)),
  });
}

export function useValidateInspeksiGh() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, decision, validationNote }: { id: string; decision: "VALIDATED" | "REJECTED"; validationNote?: string | null }) =>
      v2Post<InspeksiGhDetail, { decision: string; validationNote?: string | null }>(
        `/gh/inspeksi/${id}/validate`,
        { decision, validationNote },
      ),
    onSuccess: (_d, { id }) => {
      toast.success("Status validasi diperbarui");
      qc.invalidateQueries({ queryKey: inspeksiGh.keys.lists() });
      qc.invalidateQueries({ queryKey: inspeksiGh.keys.detail(id) });
    },
    onError: (e) => toast.error(handleError(e as never)),
  });
}
