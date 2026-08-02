// VoltHub — Inspeksi GI resource (Laporan GI Teknis Lengkap, Gardu Induk RTUPP1).
// Backend: BE/src/modules/laporan-gi → /api/v1/gi/inspeksi.
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createResource } from "@/features/v2/createResource";
import { v2Post, handleError } from "@/lib/api/v2";
import {
  GI_KESIMPULAN,
  GI_KESIMPULAN_LABELS,
  GI_KONDISI,
  GI_MCB_STATUS,
  GI_DI_MASTER,
  GI_MPUF_MASTER,
  GI_CENTRALIZE,
  GI_LEVEL_AIR,
  GI_BATTERY_BACKUP,
  GI_JENIS_BATERAI,
  PMT_STATUSES,
  LR_STATUSES,
  type GiReportStatus,
  type GiComparison,
} from "@/lib/v2/enums";

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

export interface InspeksiGiRow {
  id: string;
  locationId: string;
  feederId: string | null;
  workOrderId: string | null;
  up3: string | null;
  reportDate: string;
  pelaksana: string | null;
  status: GiReportStatus;
  comparisonResult: GiComparison;
  location?: LocationRef;
  feeder?: FeederRef;
  inspector?: UserRef;
  workOrder?: { id: string; woNumber?: string | null } | null;
  createdAt?: string;
}

type Section = Record<string, unknown> | null;

export interface InspeksiGiDetail extends InspeksiGiRow {
  // Section payloads (JSON per-section).
  rectifier: Section;
  rectifierBackup: Section;
  baterai: Section;
  serialDevice: Section;
  rtuIo: Section;
  kubikel: Section;
  relayProteksi: Section;
  // Status inti kubikel + "DI MASTER" — kolom SCALAR.
  statusPmt: string | null;
  statusPmtDiMaster: string | null;
  statusLr: string | null;
  statusLrDiMaster: string | null;
  esDiMaster: string | null;
  mpufDiMaster: string | null;
  scadaRtuName: string | null;
  scadaSnapshotId: string | null;
  notes: string | null;
  catatan: string | null;
  submittedAt: string | null;
  validatedAt: string | null;
  validatedBy: string | null;
  validationNote: string | null;
}

export interface InspeksiGiParams extends Record<string, unknown> {
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

export interface CreateInspeksiGi extends Record<string, unknown> {
  locationId?: string | null;
  feederId?: string | null;
  workOrderId?: string | null;
  reportDate: string;
  pelaksana?: string | null;
  // Scalar status (top-level).
  statusPmt?: string | null;
  statusPmtDiMaster?: string | null;
  statusLr?: string | null;
  statusLrDiMaster?: string | null;
  esDiMaster?: string | null;
  mpufDiMaster?: string | null;
  // Sections (JSON).
  rectifier?: Section;
  rectifierBackup?: Section;
  baterai?: Section;
  serialDevice?: Section;
  rtuIo?: Section;
  kubikel?: Section;
  relayProteksi?: Section;
  notes?: string | null;
  catatan?: string | null;
  scadaRtuName?: string | null;
}

export const inspeksiGi = createResource<
  InspeksiGiRow,
  InspeksiGiDetail,
  CreateInspeksiGi,
  CreateInspeksiGi,
  InspeksiGiParams
>({
  key: "v2-inspeksi-gi",
  path: "/gi/inspeksi",
  labels: { entity: "Inspeksi GI" },
});

export function useSubmitInspeksiGi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => v2Post<InspeksiGiDetail>(`/gi/inspeksi/${id}/submit`),
    onSuccess: (_d, id) => {
      toast.success("Laporan dikirim untuk validasi");
      qc.invalidateQueries({ queryKey: inspeksiGi.keys.lists() });
      qc.invalidateQueries({ queryKey: inspeksiGi.keys.detail(id) });
    },
    onError: (e) => toast.error(handleError(e as never)),
  });
}

export function useValidateInspeksiGi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, decision, validationNote }: { id: string; decision: "VALIDATED" | "REJECTED"; validationNote?: string | null }) =>
      v2Post<InspeksiGiDetail, { decision: string; validationNote?: string | null }>(
        `/gi/inspeksi/${id}/validate`,
        { decision, validationNote },
      ),
    onSuccess: (_d, { id }) => {
      toast.success("Status validasi diperbarui");
      qc.invalidateQueries({ queryKey: inspeksiGi.keys.lists() });
      qc.invalidateQueries({ queryKey: inspeksiGi.keys.detail(id) });
    },
    onError: (e) => toast.error(handleError(e as never)),
  });
}

// ── Konfigurasi section (data-driven accordion) ──────────────────────────────
export type GiFieldKind = "text" | "textarea" | "number" | "select" | "select-other";
export interface GiFieldDef {
  name: string;
  label: string;
  kind?: GiFieldKind;
  options?: readonly string[];
  optionLabels?: Record<string, string>;
}

export type GiSectionVariant = "flat" | "serialDevice" | "kubikel";
export interface GiSectionDef {
  key: string;
  label: string;
  variant?: GiSectionVariant;
  absentable?: boolean;
  fields?: GiFieldDef[];
}

const kondisi: GiFieldDef = { name: "kondisi", label: "Kondisi", kind: "select", options: GI_KONDISI };
const keterangan: GiFieldDef = { name: "keterangan", label: "Keterangan", kind: "textarea" };
const kesimpulan: GiFieldDef = {
  name: "kesimpulan",
  label: "Kesimpulan Kondisi",
  kind: "select",
  options: GI_KESIMPULAN,
  optionLabels: GI_KESIMPULAN_LABELS as Record<string, string>,
};

const serialDeviceFields: GiFieldDef[] = [
  { name: "merk", label: "Merk" },
  { name: "type", label: "Type" },
  kondisi,
  { name: "jumlahPort", label: "Jumlah Serial Port", kind: "number" },
  { name: "portTerpakai", label: "Port Terpakai", kind: "number" },
  { name: "blinking", label: "Blinking Port", kind: "number" },
  keterangan,
  kesimpulan,
];

export const SERIAL_DEVICE_FIELDS = serialDeviceFields;

export const GI_STATUS_FIELDS: GiFieldDef[] = [
  { name: "statusPmt", label: "Status PMT (lapangan)", kind: "select", options: PMT_STATUSES },
  { name: "statusPmtDiMaster", label: "Status PMT DI MASTER", kind: "select", options: GI_DI_MASTER },
  { name: "statusLr", label: "Status L/R (lapangan)", kind: "select", options: LR_STATUSES },
  { name: "statusLrDiMaster", label: "Status L/R DI MASTER", kind: "select", options: GI_DI_MASTER },
  { name: "esDiMaster", label: "Status ES DI MASTER", kind: "select", options: GI_DI_MASTER },
  { name: "mpufDiMaster", label: "MPUF DI MASTER", kind: "select", options: GI_MPUF_MASTER },
];

export const INSPEKSI_GI_SECTIONS: GiSectionDef[] = [
  {
    key: "rectifier",
    label: "Rectifier",
    variant: "flat",
    fields: [
      { name: "merk", label: "Merk" },
      { name: "type", label: "Type" },
      { name: "serialNumber", label: "Serial Number" },
      kondisi,
      { name: "mcbSupply220", label: "MCB Supply 220V", kind: "select", options: GI_MCB_STATUS },
      { name: "hasilUkurMcb220", label: "Hasil Ukur MCB 220V", kind: "number" },
      { name: "mcbBaterai48", label: "MCB Baterai 48VDC", kind: "select", options: GI_MCB_STATUS },
      { name: "hasilUkurMcbBaterai48", label: "Hasil Ukur MCB Baterai 48VDC", kind: "number" },
      { name: "mcbLoad48", label: "MCB Load 48VDC", kind: "select", options: GI_MCB_STATUS },
      { name: "hasilUkurMcbLoad48", label: "Hasil Ukur MCB Load 48VDC", kind: "number" },
      { name: "mcb24", label: "MCB 24VDC", kind: "select", options: GI_MCB_STATUS },
      { name: "hasilUkurMcb24", label: "Hasil Ukur MCB 24VDC", kind: "number" },
      { name: "mcb12", label: "MCB/Fuse 12VDC", kind: "select", options: GI_MCB_STATUS },
      { name: "hasilUkurMcb12", label: "Hasil Ukur MCB 12VDC", kind: "number" },
      keterangan,
      kesimpulan,
    ],
  },
  {
    key: "rectifierBackup",
    label: "Rectifier Back Up",
    variant: "flat",
    absentable: true,
    fields: [
      { name: "hasilUkurInput48", label: "Hasil Ukur Terminal Input 48VDC", kind: "number" },
      { name: "hasilUkurOutput48", label: "Hasil Ukur Terminal Output 48VDC", kind: "number" },
      { name: "hasilUkurDcGroundPos", label: "Hasil Ukur DC Ground (Positif–Ground)", kind: "number" },
      { name: "hasilUkurDcGroundNeg", label: "Hasil Ukur DC Ground (Negatif–Ground)", kind: "number" },
      keterangan,
      kesimpulan,
    ],
  },
  {
    key: "baterai",
    label: "Baterai",
    variant: "flat",
    fields: [
      { name: "jenis", label: "Jenis Baterai", kind: "select-other", options: GI_JENIS_BATERAI },
      { name: "merk", label: "Merk" },
      { name: "type", label: "Type" },
      { name: "jumlahCell", label: "Jumlah Cell", kind: "number" },
      { name: "levelAir", label: "Level Air Baterai", kind: "select", options: GI_LEVEL_AIR },
      { name: "backupSaatMcbOff", label: "Backup saat MCB 220 OFF?", kind: "select", options: GI_BATTERY_BACKUP },
      keterangan,
      kesimpulan,
    ],
  },
  { key: "serialDevice", label: "Serial Device (Utama/Ke-2)", variant: "serialDevice" },
  {
    key: "rtuIo",
    label: "RTU I/O",
    variant: "flat",
    fields: [
      { name: "merk", label: "Merk" },
      { name: "type", label: "Type" },
      { name: "serialNumber", label: "Serial Number" },
      kondisi,
      { name: "mcb", label: "MCB 48 VDC/12 VDC", kind: "select", options: GI_MCB_STATUS },
      { name: "hasilUkurMcb", label: "Hasil Ukur MCB", kind: "number" },
      keterangan,
      kesimpulan,
    ],
  },
  { key: "kubikel", label: "Kubikel (+ Grid Relay)", variant: "kubikel" },
  {
    key: "relayProteksi",
    label: "Relay Protection",
    variant: "flat",
    absentable: true,
    fields: [
      { name: "merk", label: "Merk" },
      { name: "type", label: "Type" },
      { name: "serialNumber", label: "Serial Number" },
      kondisi,
      { name: "protocol", label: "Protocol" },
      { name: "address", label: "Address" },
      keterangan,
      kesimpulan,
    ],
  },
];

export { GI_KESIMPULAN_LABELS };

export const inspeksiGiHeaderSchema = z.object({
  locationId: z.string().min(1, "Gardu Induk wajib dipilih"),
  feederId: z.string().nullish(),
  reportDate: z.string().min(1, "Tanggal wajib diisi"),
  pelaksana: z.string().nullish(),
});
