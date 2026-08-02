// VoltHub — Enterprise Report Generator (frontend).
// Backend: BE/src/modules/reports. Unified generate (any source × PDF|Excel),
// versioned generated-reports history, blob download (records download history),
// and per-report download audit trail. Docs: docs/REPORT_GENERATOR.md.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { v2List, v2Post, v2Download, v2Get, handleError, type Paginated } from "@/lib/api/v2";
import type { LocationRef } from "@/features/v2/inspections/resource";

export const SOURCE_TYPES = ["LAPORAN_AWAL", "LAPORAN_AKHIR", "INSPECTION", "HAR"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];
export type ReportFormat = "PDF" | "EXCEL";

export const SOURCE_LABELS: Record<SourceType, string> = {
  LAPORAN_AWAL: "Laporan Awal",
  LAPORAN_AKHIR: "Laporan Akhir",
  INSPECTION: "Inspeksi",
  HAR: "HAR",
};

export interface GeneratedReport {
  id: string;
  locationId: string | null;
  reportNumber: string;
  reportType: string;
  format: ReportFormat;
  sourceType: SourceType | null;
  sourceId: string | null;
  version: number;
  title: string | null;
  templateKey: string | null;
  fileSize: number | null;
  downloadCount: number;
  pdfUrl: string;
  generatedAt?: string;
  generatedBy?: string | null;
  location?: LocationRef;
  _count?: { downloads: number };
}

export interface ReportDownload {
  id: string;
  reportId: string;
  downloadedBy: string | null;
  ipAddress: string | null;
  downloadedAt: string;
}

export interface GeneratedReportParams extends Record<string, unknown> {
  page?: number;
  limit?: number;
  locationId?: string;
  reportType?: string;
  sourceType?: SourceType;
  sourceId?: string;
  format?: ReportFormat;
}

interface GenerateBody extends Record<string, unknown> {
  sourceType: SourceType;
  sourceId: string;
  format: ReportFormat;
}

const EXT: Record<ReportFormat, string> = { PDF: "pdf", EXCEL: "xlsx" };

const keys = {
  list: (p?: GeneratedReportParams) => ["v2-generated-reports", "list", p ?? {}] as const,
  lists: () => ["v2-generated-reports"] as const,
  downloads: (id: string) => ["v2-generated-reports", "downloads", id] as const,
};

export function useGeneratedReports(params?: GeneratedReportParams) {
  return useQuery<Paginated<GeneratedReport>>({
    queryKey: keys.list(params),
    queryFn: () => v2List<GeneratedReport>("/reports/generated", params),
  });
}

/** Download-history (audit trail) for one generated report. */
export function useReportDownloads(reportId: string | undefined, enabled = true) {
  return useQuery<ReportDownload[]>({
    queryKey: keys.downloads(reportId ?? "—"),
    queryFn: () => v2Get<ReportDownload[]>(`/reports/generated/${reportId}/downloads`),
    enabled: !!reportId && enabled,
  });
}

/** Stream a stored report to the browser as a file download. */
async function triggerDownload(report: { id: string; reportNumber?: string; format?: ReportFormat }) {
  const ext = EXT[report.format ?? "PDF"];
  const blob = await v2Download(`/reports/generated/${report.id}/download`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${report.reportNumber ?? "report"}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Download an already-generated report by id (records download history). */
export function useDownloadReport() {
  return useMutation({
    mutationFn: (report: { id: string; reportNumber?: string; format?: ReportFormat }) =>
      triggerDownload(report),
    onError: (e) => toast.error(handleError(e as never)),
  });
}

/**
 * Unified generate: build a report for any source in PDF or Excel, refresh the
 * download center, then stream the file to the browser.
 */
export function useGenerateReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { sourceType: SourceType; sourceId: string; format: ReportFormat }) => {
      const report = await v2Post<GeneratedReport, GenerateBody>("/reports/generate", {
        sourceType: vars.sourceType,
        sourceId: vars.sourceId,
        format: vars.format,
      });
      await triggerDownload({
        id: report.id,
        reportNumber: report.reportNumber,
        format: vars.format,
      });
      return report;
    },
    onSuccess: (_r, vars) => {
      toast.success(`${SOURCE_LABELS[vars.sourceType]} (${vars.format}) dibuat & diunduh`);
      qc.invalidateQueries({ queryKey: keys.lists() });
    },
    onError: (e) => toast.error(handleError(e as never)),
  });
}

// ── Back-compat thin wrappers (legacy callers) ──────────────────────────────
export function useGenerateInspectionReport() {
  const gen = useGenerateReport();
  return {
    ...gen,
    mutate: (inspectionId: string, opts?: Parameters<typeof gen.mutate>[1]) =>
      gen.mutate({ sourceType: "INSPECTION", sourceId: inspectionId, format: "PDF" }, opts),
  };
}
export function useGenerateHarReport() {
  const gen = useGenerateReport();
  return {
    ...gen,
    mutate: (harReportId: string, opts?: Parameters<typeof gen.mutate>[1]) =>
      gen.mutate({ sourceType: "HAR", sourceId: harReportId, format: "PDF" }, opts),
  };
}
