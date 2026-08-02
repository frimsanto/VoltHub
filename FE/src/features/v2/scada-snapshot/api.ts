// VoltHub — SCADA snapshot (Siemens SP7 daily export) data hooks.
//
// Backend: BE/src/modules/scada-upload (mounted at /api/v1/scada). The NOC
// team replaces the live snapshot per fileType every day; the Inscan/OOP (RTU)
// and Lines dashboards read from the latest snapshot. UP = Inscan, DOWN = OOP.
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import type { AxiosProgressEvent } from "axios";
import { toast } from "sonner";
import { v2Get, v2List, v2Upload, handleError, type Paginated } from "@/lib/api/v2";

export type ScadaFileType = "RTU" | "LINES";
/** NONE = baris tanpa Oper State (slot channel UNASG — Lines saja). */
export type ScadaOperFilter = "UP" | "DOWN" | "NONE" | "ALL";

export interface ScadaUploader {
  id: string;
  name: string;
  email: string;
}

export interface ScadaServerBreakdown {
  ifsServer: string | null;
  up: number;
  down: number;
  /** Slot channel UNASG tanpa Oper State. */
  none: number;
  total: number;
}

/** GET /scada/snapshot/latest — `null` when nothing has been uploaded yet. */
export interface ScadaLatestSnapshot {
  id: string;
  fileType: ScadaFileType;
  uploadedAt: string;
  uploader: ScadaUploader;
  totalRows: number;
  totalUp: number;
  totalDown: number;
  notes: string | null;
  /** RTU only: rows matched to a registered gardu (Location.code). */
  matched: number | null;
  /** LINES only: UP/DOWN split per IFS server. */
  servers: ScadaServerBreakdown[] | null;
}

export interface ScadaRtuRow {
  id: string;
  rtuName: string;
  rtuText: string | null;
  operState: string;
  adminState: string | null;
  protocol: string | null;
  pairNr: number | null;
  channelPrimary: number | null;
  server: string | null;
  asdu: string | null;
  locationId: string | null;
  location?: { id: string; code: string; name: string } | null;
}

export interface ScadaLineRow {
  id: string;
  pairId: number | null;
  channelId: number | null;
  ifsServer: string | null;
  channelName: string | null;
  channelText: string | null;
  adminState: string | null;
  /** "UP" | "DOWN" — null untuk slot UNASG tanpa Oper State. */
  operState: string | null;
  assigned: string | null;
  dataXfr: string | null;
  deviceType: string | null;
  ipAddr: string | null;
  port: string | null;
}

export interface ScadaUploadSummary {
  snapshotId: string;
  fileType: ScadaFileType;
  uploadedAt: string;
  totalRows: number;
  totalUp: number;
  totalDown: number;
  matched: number | null;
}

export interface ScadaUploadHistoryEntry {
  id: string;
  snapshotId: string;
  uploadedAt: string;
  uploader: ScadaUploader | null;
  fileType: ScadaFileType | null;
  totalRows: number | null;
  totalUp: number | null;
  totalDown: number | null;
  matched: number | null;
}

const keys = {
  all: ["scada-snapshot"] as const,
  latest: (t: ScadaFileType) => ["scada-snapshot", "latest", t] as const,
  rtu: (p: Record<string, unknown>) => ["scada-snapshot", "rtu", p] as const,
  lines: (p: Record<string, unknown>) => ["scada-snapshot", "lines", p] as const,
  history: () => ["scada-snapshot", "history"] as const,
};

/** Latest snapshot metadata per fileType (null ⇒ belum ada upload). */
export function useScadaLatest(fileType: ScadaFileType) {
  return useQuery<ScadaLatestSnapshot | null>({
    queryKey: keys.latest(fileType),
    queryFn: () => v2Get<ScadaLatestSnapshot | null>(`/scada/snapshot/latest?fileType=${fileType}`),
  });
}

export interface ScadaRtuParams extends Record<string, unknown> {
  search?: string;
  operState?: ScadaOperFilter;
  page?: number;
  limit?: number;
}

/** Paginated RTU rows from the latest snapshot. Gate with `enabled` while the
 *  latest-snapshot query resolves so an empty DB never surfaces a 404 error. */
export function useScadaRtuRows(params: ScadaRtuParams, enabled = true) {
  return useQuery<Paginated<ScadaRtuRow>>({
    queryKey: keys.rtu(params),
    queryFn: () => v2List<ScadaRtuRow>("/scada/rtu", params),
    placeholderData: keepPreviousData,
    enabled,
    staleTime: 10_000,
  });
}

export interface ScadaLinesParams extends Record<string, unknown> {
  search?: string;
  operState?: ScadaOperFilter;
  ifsServer?: string;
  page?: number;
  limit?: number;
}

/** Paginated Line rows from the latest snapshot. */
export function useScadaLineRows(params: ScadaLinesParams, enabled = true) {
  return useQuery<Paginated<ScadaLineRow>>({
    queryKey: keys.lines(params),
    queryFn: () => v2List<ScadaLineRow>("/scada/lines", params),
    placeholderData: keepPreviousData,
    enabled,
    staleTime: 10_000,
  });
}

/** Last 30 uploads (metadata only, from the audit trail). */
export function useScadaUploadHistory() {
  return useQuery<ScadaUploadHistoryEntry[]>({
    queryKey: keys.history(),
    queryFn: () => v2Get<ScadaUploadHistoryEntry[]>("/scada/upload-history"),
  });
}

/** Upload & replace the live snapshot for one fileType (multipart). */
export function useScadaUpload(onProgress?: (e: AxiosProgressEvent) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ fileType, file }: { fileType: ScadaFileType; file: File }) => {
      const form = new FormData();
      form.append("file", file);
      form.append("fileType", fileType);
      return v2Upload<ScadaUploadSummary>("/scada/upload", form, onProgress);
    },
    onSuccess: (summary) => {
      toast.success(
        `Snapshot ${summary.fileType} di-replace: ${summary.totalRows} baris ` +
          `(${summary.totalUp} UP / ${summary.totalDown} DOWN)`,
      );
      qc.invalidateQueries({ queryKey: keys.all });
    },
    onError: (e) => toast.error(handleError(e as never)),
  });
}

// ── Shared display helpers ────────────────────────────────────────────────────

/** Data older than 24h is operationally stale — the dashboards warn on it. */
export function isSnapshotStale(uploadedAt: string | undefined | null): boolean {
  if (!uploadedAt) return false;
  return Date.now() - new Date(uploadedAt).getTime() > 24 * 60 * 60 * 1000;
}

export function formatUploadedAt(uploadedAt: string | undefined | null): string {
  if (!uploadedAt) return "—";
  return new Date(uploadedAt).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
