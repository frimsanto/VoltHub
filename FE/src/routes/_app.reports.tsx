import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { FileDown, FilePlus2, Loader2, History, FileText, FileSpreadsheet, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/v2/PageHeader";
import { DataTable } from "@/components/v2/DataTable";
import { ListToolbar, FilterSelect } from "@/components/v2/ListToolbar";
import { EntityFormModal } from "@/components/v2/EntityFormModal";
import { RoleGate } from "@/components/v2/RoleGate";
import { requireV2Role, OPS_ROLES } from "@/lib/v2/route-guards";
import { useLocationOptions } from "@/features/v2/lookups";
import { inspections } from "@/features/v2/inspections/resource";
import { harReports } from "@/features/v2/har/resource";
import { useReports } from "@/features/report";
import {
  useGeneratedReports,
  useGenerateReport,
  useDownloadReport,
  useReportDownloads,
  SOURCE_LABELS,
  type GeneratedReport,
  type SourceType,
  type ReportFormat,
} from "@/features/v2/reports/api";
import { useReportSignature, verifyPageUrl } from "@/features/v2/reports/signature";

export const Route = createFileRoute("/_app/reports")({
  beforeLoad: () => requireV2Role(OPS_ROLES),
  component: ReportsPage,
  head: () => ({ meta: [{ title: "Download Center — VoltHub" }] }),
});

const fmtDateTime = (d?: string) =>
  d ? new Date(d).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "—";

const fmtBytes = (n?: number | null) => {
  if (!n && n !== 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

const SOURCE_OPTIONS: { value: SourceType; label: string }[] = [
  { value: "LAPORAN_AWAL", label: "Laporan Awal" },
  { value: "LAPORAN_AKHIR", label: "Laporan Akhir" },
  { value: "INSPECTION", label: "Inspeksi" },
  { value: "HAR", label: "HAR" },
];

function FormatBadge({ format }: { format: ReportFormat }) {
  return format === "EXCEL" ? (
    <Badge variant="outline" className="border-green-600 text-green-700 dark:text-green-400">
      <FileSpreadsheet className="mr-1 size-3" /> Excel
    </Badge>
  ) : (
    <Badge variant="outline" className="border-red-600 text-red-700 dark:text-red-400">
      <FileText className="mr-1 size-3" /> PDF
    </Badge>
  );
}

/** Source-record picker for the chosen source type. */
function useSourceOptions(sourceType: SourceType) {
  // Resolve locationId → gardu name so picker labels show the name, not the hidden code.
  const { options: locOpts } = useLocationOptions();
  const garduName = new Map(locOpts.map((o) => [o.value, o.label]));
  const inspQ = inspections.useList({ page: 1, limit: 100 }, { enabled: sourceType === "INSPECTION" });
  const harQ = harReports.useList({ page: 1, limit: 100 }, { enabled: sourceType === "HAR" });
  const awalQ = useReports(
    { jenis: "AWAL", limit: 100 },
    { enabled: sourceType === "LAPORAN_AWAL" },
  );
  const akhirQ = useReports(
    { jenis: "AKHIR", limit: 100 },
    { enabled: sourceType === "LAPORAN_AKHIR" },
  );

  if (sourceType === "INSPECTION") {
    return {
      loading: inspQ.isLoading,
      options: (inspQ.data?.items ?? []).map((i) => ({
        value: i.id,
        label: `${new Date(i.inspectionDate).toLocaleDateString("id-ID")} — ${garduName.get(i.locationId) ?? "—"}`,
      })),
    };
  }
  if (sourceType === "HAR") {
    return {
      loading: harQ.isLoading,
      options: (harQ.data?.items ?? []).map((h) => ({
        value: h.id,
        label: `${new Date(h.reportDate).toLocaleDateString("id-ID")} — ${garduName.get(h.locationId) ?? "—"}`,
      })),
    };
  }
  const q = sourceType === "LAPORAN_AWAL" ? awalQ : akhirQ;
  return {
    loading: q.isLoading,
    options: (q.data?.items ?? []).map((r) => ({
      value: r.id,
      label: `${r.reportId} — ${r.lokasiGardu ?? r.pekerjaan ?? ""}`.trim(),
    })),
  };
}

function GenerateForm({ onDone }: { onDone: () => void }) {
  const [sourceType, setSourceType] = useState<SourceType>("INSPECTION");
  const [sourceId, setSourceId] = useState("");
  const [format, setFormat] = useState<ReportFormat>("PDF");
  const gen = useGenerateReport();
  const { options, loading } = useSourceOptions(sourceType);

  const submit = () => {
    if (!sourceId) return;
    gen.mutate({ sourceType, sourceId, format }, { onSuccess: onDone });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-sm">Jenis Sumber</Label>
        <Select
          value={sourceType}
          onValueChange={(v) => {
            setSourceType(v as SourceType);
            setSourceId("");
          }}
        >
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {SOURCE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm">Sumber</Label>
        <Select value={sourceId} onValueChange={setSourceId} disabled={loading}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={loading ? "Memuat…" : "Pilih dokumen sumber"} />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm">Format</Label>
        <Select value={format} onValueChange={(v) => setFormat(v as ReportFormat)}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="PDF">PDF</SelectItem>
            <SelectItem value="EXCEL">Excel</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onDone} disabled={gen.isPending}>Batal</Button>
        <Button onClick={submit} disabled={gen.isPending || !sourceId}>
          {gen.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
          Generate &amp; Unduh
        </Button>
      </div>
    </div>
  );
}

/**
 * Per-report digital-signature shortcut: opens the public verification page for
 * the report's signature in a new tab (docs/DIGITAL_SIGNATURE.md). Resolves the
 * signature id lazily so the table stays light.
 */
function VerifyButton({ reportId }: { reportId: string }) {
  const [enabled, setEnabled] = useState(false);
  const sig = useReportSignature(reportId, enabled);

  const open = () => {
    if (sig.data) {
      window.open(verifyPageUrl(sig.data.sigId), "_blank", "noopener");
    } else {
      setEnabled(true); // fetch, then the effect below opens it
    }
  };

  useEffect(() => {
    if (enabled && sig.data) {
      window.open(verifyPageUrl(sig.data.sigId), "_blank", "noopener");
      setEnabled(false);
    }
  }, [enabled, sig.data]);

  return (
    <Button
      variant="ghost"
      size="sm"
      title="Verifikasi tanda tangan digital"
      onClick={open}
      disabled={sig.isFetching}
    >
      {sig.isFetching ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
    </Button>
  );
}

function DownloadHistory({ report }: { report: GeneratedReport }) {
  const q = useReportDownloads(report.id);
  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground">
        {report.reportNumber} · {report.downloadCount} unduhan
      </div>
      {q.isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="size-5 animate-spin" /></div>
      ) : (q.data?.length ?? 0) === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">Belum ada unduhan.</div>
      ) : (
        <ul className="divide-y rounded-md border text-sm">
          {q.data!.map((d) => (
            <li key={d.id} className="flex items-center justify-between px-3 py-2">
              <span>{fmtDateTime(d.downloadedAt)}</span>
              <span className="text-muted-foreground">{d.ipAddress ?? "—"}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReportsPage() {
  const { options: locationOptions } = useLocationOptions();
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [sourceType, setSourceType] = useState<string | undefined>();
  const [format, setFormat] = useState<string | undefined>();
  const [locationId, setLocationId] = useState<string | undefined>();
  const [genOpen, setGenOpen] = useState(false);
  const [historyOf, setHistoryOf] = useState<GeneratedReport | null>(null);

  const query = useGeneratedReports({
    page: pagination.pageIndex + 1,
    limit: pagination.pageSize,
    sourceType: sourceType as SourceType | undefined,
    format: format as ReportFormat | undefined,
    locationId,
  });
  const download = useDownloadReport();

  const columns = useMemo<ColumnDef<GeneratedReport>[]>(
    () => [
      {
        header: "Nomor",
        accessorKey: "reportNumber",
        cell: ({ row }) => <span className="font-medium">{row.original.reportNumber}</span>,
      },
      {
        header: "Sumber",
        accessorKey: "sourceType",
        cell: ({ row }) => (
          <Badge variant="secondary">
            {row.original.sourceType ? SOURCE_LABELS[row.original.sourceType] : row.original.reportType}
          </Badge>
        ),
      },
      { header: "Format", accessorKey: "format", cell: ({ row }) => <FormatBadge format={row.original.format} /> },
      {
        header: "Versi",
        accessorKey: "version",
        cell: ({ row }) => <span className="tabular-nums">v{row.original.version}</span>,
      },
      { header: "Ukuran", accessorKey: "fileSize", cell: ({ row }) => fmtBytes(row.original.fileSize) },
      {
        header: "Unduhan",
        accessorKey: "downloadCount",
        cell: ({ row }) => <span className="tabular-nums">{row.original.downloadCount}</span>,
      },
      { header: "Dibuat", accessorKey: "generatedAt", cell: ({ row }) => fmtDateTime(row.original.generatedAt) },
      {
        id: "actions",
        header: () => <div className="text-right">Aksi</div>,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <VerifyButton reportId={row.original.id} />
            <Button variant="ghost" size="sm" onClick={() => setHistoryOf(row.original)}>
              <History className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                download.mutate({
                  id: row.original.id,
                  reportNumber: row.original.reportNumber,
                  format: row.original.format,
                })
              }
            >
              <FileDown className="size-4" /> Unduh
            </Button>
          </div>
        ),
      },
    ],
    [download],
  );

  const resetPage = () => setPagination((p) => ({ ...p, pageIndex: 0 }));

  return (
    <div>
      <PageHeader
        title="Download Center"
        description="Riwayat laporan resmi (PDF & Excel) dari semua sumber: Laporan Awal/Akhir, Inspeksi, HAR."
        actions={
          <RoleGate capability="reports.generate">
            <Button onClick={() => setGenOpen(true)}>
              <FilePlus2 className="size-4" /> Generate Laporan
            </Button>
          </RoleGate>
        }
      />

      <DataTable
        columns={columns}
        data={query.data?.items ?? []}
        pageCount={query.data?.meta.totalPages ?? 0}
        total={query.data?.meta.total}
        pagination={pagination}
        onPaginationChange={setPagination}
        isLoading={query.isLoading}
        isError={query.isError}
        onRetry={() => query.refetch()}
        toolbar={
          <ListToolbar
            searchPlaceholder="Cari…"
            onSearch={() => resetPage()}
            filters={
              <>
                <FilterSelect
                  value={sourceType}
                  onChange={(v) => { setSourceType(v); resetPage(); }}
                  placeholder="Semua Sumber"
                  options={SOURCE_OPTIONS}
                />
                <FilterSelect
                  value={format}
                  onChange={(v) => { setFormat(v); resetPage(); }}
                  placeholder="Semua Format"
                  options={[
                    { value: "PDF", label: "PDF" },
                    { value: "EXCEL", label: "Excel" },
                  ]}
                />
                <FilterSelect
                  value={locationId}
                  onChange={(v) => { setLocationId(v); resetPage(); }}
                  placeholder="Semua Lokasi"
                  options={locationOptions}
                />
              </>
            }
          />
        }
      />

      <EntityFormModal open={genOpen} onOpenChange={setGenOpen} title="Generate Laporan Resmi">
        <GenerateForm onDone={() => setGenOpen(false)} />
      </EntityFormModal>

      <EntityFormModal
        open={!!historyOf}
        onOpenChange={(o) => !o && setHistoryOf(null)}
        title="Riwayat Unduhan"
      >
        {historyOf && <DownloadHistory report={historyOf} />}
      </EntityFormModal>
    </div>
  );
}
