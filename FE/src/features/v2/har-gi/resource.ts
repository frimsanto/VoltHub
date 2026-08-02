// VoltHub — Laporan HAR GI resource (korektif/pemeliharaan GI, 81 kolom xlsx).
// FASE B. Backend: BE/src/modules/laporan-har-gi (/gi/har). WAJIB ber-WO; Opsi B
// (induk + JSON per-section). Pola mengikuti Laporan GI (inspeksi-gi).
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createResource } from "@/features/v2/createResource";
import { v2Post, handleError } from "@/lib/api/v2";
import type { GiReportStatus } from "@/lib/v2/enums";
import {
  HAR_KONDISI,
  HAR_JENIS_BATERAI,
  HAR_KONDISI_CCTV,
  GI_KESIMPULAN,
  GI_KESIMPULAN_LABELS,
} from "@/lib/v2/enums";
import type {
  LocationRef,
  FeederRef,
  UserRef,
  GiFieldDef,
} from "@/features/v2/inspeksi-gi/resource";

type Section = Record<string, unknown> | null;

export interface HarGiRow {
  id: string;
  workOrderId: string;
  locationId: string;
  feederId: string | null;
  assetId: string | null;
  up3: string | null;
  reportDate: string;
  ketKunjungan: string | null;
  pelaksana: string | null;
  pengawas: string | null;
  status: GiReportStatus;
  statusGarduSebelum: string | null;
  statusGarduSesudah: string | null;
  statusPekerjaan: string | null;
  penyebabGangguan: string[] | null;
  location?: LocationRef;
  feeder?: FeederRef;
  inspector?: UserRef;
  workOrder?: { id: string; woNumber?: string | null } | null;
  createdAt?: string;
}

export interface HarGiDetail extends HarGiRow {
  scadaRtuName: string | null;
  io: Section;
  relay: Section;
  rectifier: Section;
  baterai: Section;
  serialDevice: Section;
  cctv: Section;
  penanganan: Section;
  submittedAt: string | null;
  validatedAt: string | null;
  validatedBy: string | null;
  validationNote: string | null;
}

export interface HarGiParams extends Record<string, unknown> {
  page?: number;
  limit?: number;
  locationId?: string;
  workOrderId?: string;
  status?: GiReportStatus;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface CreateHarGi extends Record<string, unknown> {
  workOrderId: string;
  feederId?: string | null;
  reportDate: string;
  pelaksana?: string | null;
  pengawas?: string | null;
  ketKunjungan?: string | null;
  scadaRtuName?: string | null;
  statusGarduSebelum?: string | null;
  statusGarduSesudah?: string | null;
  statusPekerjaan?: string | null;
  penyebabGangguan?: string[] | null;
  io?: Section;
  relay?: Section;
  rectifier?: Section;
  baterai?: Section;
  serialDevice?: Section;
  cctv?: Section;
  penanganan?: Section;
  status?: GiReportStatus;
}

export const harGi = createResource<HarGiRow, HarGiDetail, CreateHarGi, CreateHarGi, HarGiParams>({
  key: "v2-har-gi",
  path: "/gi/har",
  labels: { entity: "Laporan HAR GI" },
});

export function useSubmitHarGi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => v2Post<HarGiDetail>(`/gi/har/${id}/submit`),
    onSuccess: (_d, id) => {
      toast.success("Laporan dikirim untuk validasi");
      qc.invalidateQueries({ queryKey: harGi.keys.lists() });
      qc.invalidateQueries({ queryKey: harGi.keys.detail(id) });
    },
    onError: (e) => toast.error(handleError(e as never)),
  });
}

export function useValidateHarGi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, decision, validationNote }: { id: string; decision: "VALIDATED" | "REJECTED"; validationNote?: string | null }) =>
      v2Post<HarGiDetail, { decision: string; validationNote?: string | null }>(`/gi/har/${id}/validate`, {
        decision,
        validationNote,
      }),
    onSuccess: (_d, { id }) => {
      toast.success("Status validasi diperbarui");
      qc.invalidateQueries({ queryKey: harGi.keys.lists() });
      qc.invalidateQueries({ queryKey: harGi.keys.detail(id) });
    },
    onError: (e) => toast.error(handleError(e as never)),
  });
}

// ── Konfigurasi section (data-driven; reuse GiFieldDef dari Laporan GI) ───────
const kondisi: GiFieldDef = { name: "kondisi", label: "Kondisi", kind: "select", options: HAR_KONDISI };
const catatan: GiFieldDef = { name: "catatan", label: "Catatan", kind: "textarea" };
const kesimpulan: GiFieldDef = {
  name: "kesimpulan",
  label: "Kesimpulan Kondisi",
  kind: "select",
  options: GI_KESIMPULAN,
  optionLabels: GI_KESIMPULAN_LABELS as Record<string, string>,
};

/** I/O · Relay · Rectifier — fields seragam (merk/type/sn/kondisi/catatan). */
const deviceFields: GiFieldDef[] = [
  { name: "merk", label: "Merk" },
  { name: "type", label: "Type" },
  { name: "serialNumber", label: "Serial Number" },
  kondisi,
  catatan,
];

const bateraiFields: GiFieldDef[] = [
  { name: "jenis", label: "Jenis Baterai", kind: "select-other", options: HAR_JENIS_BATERAI },
  { name: "merk", label: "Merk" },
  { name: "type", label: "Type" },
  kondisi,
  catatan,
];

/** Serial Device (utama / ke-2). */
export const HAR_SERIAL_FIELDS: GiFieldDef[] = [
  { name: "merk", label: "Merk" },
  { name: "type", label: "Type" },
  kondisi,
  { name: "jumlahPort", label: "Jumlah Serial Port", kind: "number" },
  { name: "portTerpakai", label: "Port Terpakai", kind: "number" },
  { name: "blinking", label: "Blinking Port", kind: "number" },
  { name: "keterangan", label: "Keterangan", kind: "textarea" },
  kesimpulan,
];

/** CCTV Bullet / PTZ. */
export const HAR_CCTV_CAMERA_FIELDS: GiFieldDef[] = [
  { name: "merk", label: "Merk" },
  { name: "jumlah", label: "Jumlah", kind: "number" },
  { name: "kondisi", label: "Kondisi", kind: "select-other", options: HAR_KONDISI_CCTV },
  { name: "pengukuranTegangan", label: "Pengukuran Tegangan" },
  catatan,
];

/** CCTV NVR. */
export const HAR_CCTV_NVR_FIELDS: GiFieldDef[] = [
  { name: "merk", label: "Merk" },
  { name: "type", label: "Type" },
  kondisi,
  catatan,
];

/** CCTV Switch PoE. */
export const HAR_CCTV_SWITCHPOE_FIELDS: GiFieldDef[] = [
  { name: "merk", label: "Merk" },
  kondisi,
  catatan,
  { name: "jumlahPort", label: "Jumlah Semua Port", kind: "number" },
  { name: "portTerpakai", label: "Port Terpakai", kind: "number" },
  { name: "blinking", label: "Blinking Port Terpakai" },
  { name: "pengukuranTegangan", label: "Pengukuran Tegangan PoE" },
  { name: "catatanBlinking", label: "Catatan Blinking", kind: "textarea" },
];

/** Flat device sections (akar JSON langsung). */
export interface HarFlatSection {
  key: "io" | "relay" | "rectifier" | "baterai";
  label: string;
  fields: GiFieldDef[];
}
export const HAR_FLAT_SECTIONS: HarFlatSection[] = [
  { key: "io", label: "I/O", fields: deviceFields },
  { key: "relay", label: "Relay", fields: deviceFields },
  { key: "rectifier", label: "Rectifier", fields: deviceFields },
  { key: "baterai", label: "Baterai", fields: bateraiFields },
];

/** Sub-bagian CCTV (masing-masing absentable via <key>TidakAda di JSON cctv). */
export interface HarCctvPart {
  key: "bullet" | "ptz" | "nvr" | "switchPoe";
  label: string;
  fields: GiFieldDef[];
}
export const HAR_CCTV_PARTS: HarCctvPart[] = [
  { key: "bullet", label: "CCTV Bullet", fields: HAR_CCTV_CAMERA_FIELDS },
  { key: "ptz", label: "CCTV PTZ", fields: HAR_CCTV_CAMERA_FIELDS },
  { key: "nvr", label: "NVR", fields: HAR_CCTV_NVR_FIELDS },
  { key: "switchPoe", label: "Switch PoE", fields: HAR_CCTV_SWITCHPOE_FIELDS },
];
