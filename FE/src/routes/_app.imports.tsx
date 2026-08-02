import { createFileRoute, useNavigate, Outlet, useMatches } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { Upload, Loader2, Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/v2/PageHeader";
import { DataTable } from "@/components/v2/DataTable";
import { ListToolbar, FilterSelect } from "@/components/v2/ListToolbar";
import { RowActions } from "@/components/v2/RowActions";
import { ImportStatusBadge } from "@/components/v2/StatusBadge";
import { requireV2Role, ADMIN_TIER_ROLES } from "@/lib/v2/route-guards";
import {
  useImportJobs,
  useUploadImport,
  downloadImportTemplate,
  importDomainLabel,
  IMPORT_DOMAINS,
  IMPORT_DOMAIN_BY_KEY,
  type ImportDomain,
  type ImportJob,
} from "@/features/v2/imports/resource";

export const Route = createFileRoute("/_app/imports")({
  beforeLoad: () => requireV2Role(ADMIN_TIER_ROLES),
  component: ImportsPage,
  head: () => ({ meta: [{ title: "Import — VoltHub" }] }),
});

const fmtDateTime = (d?: string | null) =>
  d ? new Date(d).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "—";

const shortId = (id: string) => id.slice(0, 8);

function ImportsPage() {
  const navigate = useNavigate();
  const matches = useMatches();
  const showingDetail = matches.some((m) => m.routeId === "/_app/imports/$id");
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = useUploadImport();
  // The domain whose file picker we're about to open.
  const pendingDomain = useRef<ImportDomain | null>(null);

  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [status, setStatus] = useState<string | undefined>();
  const [domain, setDomain] = useState<string | undefined>();

  const query = useImportJobs({
    page: pagination.pageIndex + 1,
    limit: pagination.pageSize,
    status,
  });

  // Domain isn't a backend filter param → filter the current page client-side.
  const rows = useMemo(() => {
    const items = query.data?.items ?? [];
    return domain ? items.filter((j) => j.importType === domain) : items;
  }, [query.data?.items, domain]);

  const startUpload = (d: ImportDomain) => {
    pendingDomain.current = d;
    fileRef.current?.click();
  };

  const columns = useMemo<ColumnDef<ImportJob>[]>(
    () => [
      {
        header: "Import ID",
        accessorKey: "id",
        cell: ({ row }) => (
          <code className="text-xs text-muted-foreground" title={row.original.id}>
            {shortId(row.original.id)}
          </code>
        ),
      },
      {
        header: "Domain",
        accessorKey: "importType",
        cell: ({ row }) => <span className="font-medium">{importDomainLabel(row.original.importType)}</span>,
      },
      {
        header: "File",
        accessorKey: "fileName",
        cell: ({ row }) => <span className="truncate">{row.original.fileName}</span>,
      },
      { header: "Status", accessorKey: "status", cell: ({ row }) => <ImportStatusBadge status={row.original.status} /> },
      {
        header: "Total",
        accessorKey: "totalRows",
        cell: ({ row }) => <span className="tabular-nums">{row.original.totalRows ?? 0}</span>,
      },
      {
        header: "Berhasil",
        accessorKey: "successRows",
        cell: ({ row }) => <span className="tabular-nums text-green-600 dark:text-green-400">{row.original.successRows ?? 0}</span>,
      },
      {
        header: "Gagal",
        accessorKey: "failedRows",
        cell: ({ row }) => {
          const f = row.original.failedRows ?? 0;
          return <span className={`tabular-nums ${f > 0 ? "text-destructive" : "text-muted-foreground"}`}>{f}</span>;
        },
      },
      { header: "Dibuat", accessorKey: "createdAt", cell: ({ row }) => fmtDateTime(row.original.createdAt) },
      {
        id: "actions",
        header: () => <div className="text-right">Aksi</div>,
        cell: ({ row }) => <RowActions onView={() => navigate({ to: "/imports/$id", params: { id: row.original.id as string } })} />,
      },
    ],
    [navigate],
  );

  const resetPage = () => setPagination((p) => ({ ...p, pageIndex: 0 }));

  if (showingDetail) return <Outlet />;

  return (
    <div>
      <PageHeader
        title="Import"
        description="Impor massal Gardu, Penyulang, Asset, dan Performance dari file Excel/CSV."
        actions={
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                const d = pendingDomain.current;
                if (file && d) upload.mutate({ domain: d, file });
                pendingDomain.current = null;
                e.target.value = "";
              }}
            />

            {/* Template download — all four domains */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Download className="size-4" /> Template
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Unduh Template</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {IMPORT_DOMAINS.map((d) => (
                  <DropdownMenuItem key={d.key} onSelect={() => downloadImportTemplate(d)}>
                    <FileSpreadsheet className="size-4" /> {d.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Upload — pick a domain, then a file */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button disabled={upload.isPending}>
                  {upload.isPending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                  Upload
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Pilih Domain Import</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {IMPORT_DOMAINS.map((d) => (
                  <DropdownMenuItem
                    key={d.key}
                    disabled={!d.uploadPath}
                    onSelect={() => startUpload(d)}
                  >
                    <Upload className="size-4" /> {d.label}
                    {!d.uploadPath && <span className="ml-auto text-xs text-muted-foreground">segera</span>}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <DataTable
        columns={columns}
        data={rows}
        pageCount={query.data?.meta.totalPages ?? 0}
        total={query.data?.meta.total}
        pagination={pagination}
        onPaginationChange={setPagination}
        isLoading={query.isLoading}
        isError={query.isError}
        onRetry={() => query.refetch()}
        onRowClick={(row) => navigate({ to: "/imports/$id", params: { id: row.id as string } })}
        toolbar={
          <ListToolbar
            searchPlaceholder="Cari…"
            onSearch={() => resetPage()}
            filters={
              <>
                <FilterSelect
                  value={domain}
                  onChange={(v) => { setDomain(v); resetPage(); }}
                  placeholder="Semua Domain"
                  options={IMPORT_DOMAINS.map((d) => ({ value: d.key, label: d.label }))}
                />
                <FilterSelect
                  value={status}
                  onChange={(v) => { setStatus(v); resetPage(); }}
                  placeholder="Semua Status"
                  options={[
                    { value: "PENDING", label: "PENDING" },
                    { value: "PROCESSING", label: "PROCESSING" },
                    { value: "SUCCESS", label: "SUCCESS" },
                    { value: "FAILED", label: "FAILED" },
                  ]}
                />
              </>
            }
          />
        }
      />

      <p className="mt-3 flex items-start gap-1 text-xs text-muted-foreground">
        <Download className="mt-0.5 size-3.5 shrink-0" /> Unduh template tiap domain untuk melihat kolom yang
        diharapkan. Kolom Asset: {IMPORT_DOMAIN_BY_KEY.ASSET.columns.map((c) => c.name).join(", ")}.
      </p>
    </div>
  );
}
