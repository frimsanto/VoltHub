// VoltHub — Laporan HAR MP resource (korektif/pemeliharaan Metering Point / Gardu
// Distribusi, RTUPP2-5). Backend: BE/src/modules/laporan-har-mp (/mp/har). WAJIB
// ber-WO; struktur SAMA dengan Inspeksi MP (beda aturan isi + field HAR khusus).
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createResource } from "@/features/v2/createResource";
import { v2Post, handleError } from "@/lib/api/v2";
import type { GiReportStatus } from "@/lib/v2/enums";
import type { KubikelEntry } from "@/features/v2/mp-shared/mpSections";
import type { LocationRef, FeederRef, UserRef } from "@/features/v2/inspeksi-mp/resource";

type Section = Record<string, unknown> | null;

export interface HarMpRow {
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

export interface HarMpDetail extends HarMpRow {
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

export interface HarMpParams extends Record<string, unknown> {
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

export interface CreateHarMp extends Record<string, unknown> {
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

export const harMp = createResource<
  HarMpRow,
  HarMpDetail,
  CreateHarMp,
  Partial<CreateHarMp>,
  HarMpParams
>({
  key: "v2-har-mp",
  path: "/mp/har",
  labels: { entity: "Laporan HAR MP" },
});

export function useSubmitHarMp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => v2Post<HarMpDetail>(`/mp/har/${id}/submit`),
    onSuccess: (_d, id) => {
      toast.success("Laporan dikirim untuk validasi");
      qc.invalidateQueries({ queryKey: harMp.keys.lists() });
      qc.invalidateQueries({ queryKey: harMp.keys.detail(id) });
    },
    onError: (e) => toast.error(handleError(e as never)),
  });
}

export function useValidateHarMp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, decision, validationNote }: { id: string; decision: "VALIDATED" | "REJECTED"; validationNote?: string | null }) =>
      v2Post<HarMpDetail, { decision: string; validationNote?: string | null }>(
        `/mp/har/${id}/validate`,
        { decision, validationNote },
      ),
    onSuccess: (_d, { id }) => {
      toast.success("Status validasi diperbarui");
      qc.invalidateQueries({ queryKey: harMp.keys.lists() });
      qc.invalidateQueries({ queryKey: harMp.keys.detail(id) });
    },
    onError: (e) => toast.error(handleError(e as never)),
  });
}
