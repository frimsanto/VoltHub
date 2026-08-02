// VoltHub — Laporan HAR GH resource (korektif/pemeliharaan Gardu Hubung, RTUPP2-5).
// Backend: BE/src/modules/laporan-har-gh (/gh/har). WAJIB ber-WO; struktur 152 kolom
// SAMA dengan Inspeksi GH (beda aturan isi + field HAR khusus).
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createResource } from "@/features/v2/createResource";
import { v2Post, handleError } from "@/lib/api/v2";
import type { GiReportStatus } from "@/lib/v2/enums";
import type { KubikelEntry } from "@/features/v2/gh-shared/ghSections";
import type { LocationRef, FeederRef, UserRef } from "@/features/v2/inspeksi-gh/resource";

type Section = Record<string, unknown> | null;

export interface HarGhRow {
  id: string;
  // Nullable karena list menggabungkan baris historis import Excel (tanpa
  // WO/status alur) — lihat isImported.
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
  statusGarduSebelum: string | null;
  statusGarduSesudah: string | null;
  statusPekerjaan: string | null;
  penyebabGangguan: string[] | null;
  location?: LocationRef | null;
  feeder?: FeederRef | null;
  inspector?: UserRef | null;
  workOrder?: { id: string; woNumber?: string | null } | null;
  createdAt?: string;
  /** Baris historis dari import Excel (har_gardu_records) — bukan laporan alur WO. */
  isImported?: boolean;
  kodeGardu?: string | null;
  penyulang?: string | null;
  jenisPekerjaan?: string | null;
  analisaGangguan?: string | null;
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

export interface HarGhDetail extends HarGhRow {
  supplyTr: Section;
  rectifier: Section;
  baterai: Section;
  rtu: Section;
  media1: Section;
  media2: Section;
  kubikel: KubikelEntry[] | null;
  fdiRelay: Section;
  aco: Section;
  penanganan: Section;
  notes: string | null;
  catatan: string | null;
  submittedAt: string | null;
  validatedAt: string | null;
  validatedBy: string | null;
  validationNote: string | null;
}

export interface HarGhParams extends Record<string, unknown> {
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

export interface CreateHarGh extends Record<string, unknown> {
  workOrderId: string;
  reportDate: string;
  statusGarduSebelum?: string | null;
  statusGarduSesudah?: string | null;
  statusPekerjaan?: string | null;
  penyebabGangguan?: string[] | null;
  supplyTr?: Section;
  rectifier?: Section;
  baterai?: Section;
  rtu?: Section;
  media1?: Section;
  media2?: Section;
  kubikel?: KubikelEntry[];
  fdiRelay?: Section;
  aco?: Section;
  penanganan?: Section;
  notes?: string | null;
  catatan?: string | null;
}

export const harGh = createResource<
  HarGhRow,
  HarGhDetail,
  CreateHarGh,
  Partial<CreateHarGh>,
  HarGhParams
>({
  key: "v2-har-gh",
  path: "/gh/har",
  labels: { entity: "Laporan HAR GH" },
});

export function useSubmitHarGh() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => v2Post<HarGhDetail>(`/gh/har/${id}/submit`),
    onSuccess: (_d, id) => {
      toast.success("Laporan dikirim untuk validasi");
      qc.invalidateQueries({ queryKey: harGh.keys.lists() });
      qc.invalidateQueries({ queryKey: harGh.keys.detail(id) });
    },
    onError: (e) => toast.error(handleError(e as never)),
  });
}

export function useValidateHarGh() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, decision, validationNote }: { id: string; decision: "VALIDATED" | "REJECTED"; validationNote?: string | null }) =>
      v2Post<HarGhDetail, { decision: string; validationNote?: string | null }>(
        `/gh/har/${id}/validate`,
        { decision, validationNote },
      ),
    onSuccess: (_d, { id }) => {
      toast.success("Status validasi diperbarui");
      qc.invalidateQueries({ queryKey: harGh.keys.lists() });
      qc.invalidateQueries({ queryKey: harGh.keys.detail(id) });
    },
    onError: (e) => toast.error(handleError(e as never)),
  });
}
