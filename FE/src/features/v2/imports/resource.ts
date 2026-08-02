// VoltHub — Import Engine (asset bulk import). Admin-tier only.
// Backend (BE/src/modules/imports): upload xlsx → ImportJob; list/get jobs;
// per-job errors. Upload is multipart so it's a dedicated hook.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { v2Get, v2List, v2Upload, handleError, type Paginated } from "@/lib/api/v2";

export type ImportStatus = "PENDING" | "PROCESSING" | "SUCCESS" | "FAILED";

export interface ImportJob {
  id: string;
  fileName: string;
  fileUrl: string | null;
  importType: string;
  status: ImportStatus;
  totalRows: number | null;
  successRows: number | null;
  failedRows: number | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt?: string;
  createdBy?: string | null;
  _count?: { errors: number };
}

export interface ImportError {
  id: string;
  importJobId: string;
  rowNumber: number;
  errorMessage: string;
  rawData: unknown;
  createdAt?: string;
}

export interface ImportJobParams extends Record<string, unknown> {
  page?: number;
  limit?: number;
  status?: string;
}

// ── Import domains ────────────────────────────────────────────────────────────
// The four supported bulk-load domains. `importType` matches what the backend
// stamps on each import_job (used to label/filter the list). `uploadPath` is the
// backend POST endpoint; `null` means the backend has no endpoint yet (template
// download still works, upload is disabled) — we add NO backend here.
export type ImportDomainKey = "GARDU" | "PENYULANG" | "ASSET" | "PERFORMANCE";

export interface ImportColumn {
  name: string;
  required?: boolean;
  note?: string;
}

export interface ImportDomain {
  key: ImportDomainKey;
  label: string;
  /** Backend POST endpoint (under /v1). `null` ⇒ no endpoint yet. */
  uploadPath: string | null;
  columns: ImportColumn[];
  /** One example row, aligned with `columns`, written into the template. */
  sample: string[];
}

export const IMPORT_DOMAINS: ImportDomain[] = [
  {
    key: "GARDU",
    label: "Gardu",
    uploadPath: "/imports/gardu",
    columns: [
      { name: "siteCode", required: true, note: "kode gardu unik" },
      { name: "siteName", required: true },
      { name: "up3" },
      { name: "address" },
      { name: "latitude", note: "-90..90" },
      { name: "longitude", note: "-180..180" },
    ],
    sample: ["GD-001", "Gardu Induk Contoh", "UP3 Jakarta", "Jl. Contoh No.1", "-6.2", "106.8"],
  },
  {
    key: "PENYULANG",
    label: "Penyulang",
    // No backend import endpoint for feeders/penyulang yet → upload disabled.
    uploadPath: null,
    columns: [
      { name: "locationCode", required: true, note: "kode gardu induk" },
      { name: "feederCode", required: true, note: "kode penyulang unik" },
      { name: "feederName", required: true },
    ],
    sample: ["GD-001", "PNY-001", "Penyulang Contoh"],
  },
  {
    key: "ASSET",
    label: "Asset",
    uploadPath: "/imports/assets",
    columns: [
      { name: "locationCode", required: true },
      { name: "feederCode" },
      { name: "assetType", required: true, note: "RTU|FDI|RECTIFIER|BATTERY_BANK|ROUTER|MODEM|RADIO" },
      { name: "assetCode", required: true },
      { name: "assetName", required: true },
      { name: "brand" },
      { name: "model" },
      { name: "serialNumber" },
      { name: "tahunOperasi", note: "1900..2100" },
      { name: "status", note: "ACTIVE|WARNING|DAMAGED|RETIRED" },
      { name: "notes" },
    ],
    sample: ["GD-001", "PNY-001", "RTU", "AST-001", "RTU Contoh", "Schneider", "T200", "SN123", "2020", "ACTIVE", ""],
  },
  {
    key: "PERFORMANCE",
    label: "Performance",
    uploadPath: "/imports/performance",
    columns: [
      { name: "siteCode", required: true, note: "kode gardu" },
      { name: "performanceDate", required: true, note: "YYYY-MM-DD" },
      { name: "performanceStatus", required: true },
      { name: "score", note: "0..100" },
    ],
    sample: ["GD-001", "2026-06-01", "NORMAL", "95"],
  },
];

export const IMPORT_DOMAIN_BY_KEY: Record<string, ImportDomain> = Object.fromEntries(
  IMPORT_DOMAINS.map((d) => [d.key, d]),
);

/** Human label for an import_job.importType (falls back to the raw value). */
export function importDomainLabel(importType?: string | null): string {
  if (!importType) return "—";
  return IMPORT_DOMAIN_BY_KEY[importType]?.label ?? importType;
}

// ── Per-row error parsing (for the Validation UI) ─────────────────────────────
// The backend joins Zod issues as "field: message; field2: message2" and stores
// business errors as a plain sentence. Split into {column?, message} segments so
// the detail page can render Row / Column / Error.
export interface ParsedErrorSegment {
  column: string | null;
  message: string;
}

export function parseImportErrorMessage(raw: string): ParsedErrorSegment[] {
  return raw
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((segment) => {
      const m = segment.match(/^([A-Za-z0-9_.]+):\s*(.+)$/);
      return m ? { column: m[1], message: m[2] } : { column: null, message: segment };
    });
}

// ── Template download (client-side CSV, no extra deps) ────────────────────────
/** Build and download a CSV template for the given domain (header + example). */
export function downloadImportTemplate(domain: ImportDomain): void {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const header = domain.columns.map((c) => c.name).map(esc).join(",");
  const example = domain.sample.map((v) => esc(v ?? "")).join(",");
  const csv = `${header}\n${example}\n`;
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `template-import-${domain.key.toLowerCase()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const keys = {
  lists: () => ["v2-import-jobs"] as const,
  list: (p?: ImportJobParams) => ["v2-import-jobs", "list", p ?? {}] as const,
  detail: (id: string) => ["v2-import-jobs", "detail", id] as const,
  errors: (id: string) => ["v2-import-jobs", "errors", id] as const,
};

export function useImportJobs(params?: ImportJobParams) {
  return useQuery<Paginated<ImportJob>>({
    queryKey: keys.list(params),
    queryFn: () => v2List<ImportJob>("/imports/jobs", params),
  });
}

export function useImportJob(id: string | undefined) {
  return useQuery({
    queryKey: keys.detail(id ?? "—"),
    queryFn: () => v2Get<ImportJob>(`/imports/jobs/${id}`),
    enabled: !!id,
  });
}

export function useImportErrors(id: string | undefined) {
  return useQuery({
    queryKey: keys.errors(id ?? "—"),
    queryFn: () => v2Get<ImportError[]>(`/imports/jobs/${id}/errors`),
    enabled: !!id,
  });
}

/**
 * Multi-domain import upload. Posts the file to the selected domain's backend
 * endpoint (Gardu / Asset / Performance). Penyulang has no endpoint yet, so its
 * upload is guarded here and rejected with a clear message.
 */
export function useUploadImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ domain, file }: { domain: ImportDomain; file: File }) => {
      if (!domain.uploadPath) {
        return Promise.reject(
          new Error(`Endpoint import ${domain.label} belum tersedia di backend.`),
        );
      }
      const form = new FormData();
      form.append("file", file);
      return v2Upload<ImportJob>(domain.uploadPath, form);
    },
    onSuccess: (job) => {
      if (job.status === "FAILED") {
        toast.warning(`Import selesai dengan kegagalan (${job.failedRows ?? 0} baris)`);
      } else {
        toast.success(`Import selesai: ${job.successRows ?? 0}/${job.totalRows ?? 0} baris`);
      }
      qc.invalidateQueries({ queryKey: keys.lists() });
    },
    onError: (e) => toast.error(handleError(e as never)),
  });
}
