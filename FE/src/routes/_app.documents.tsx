import { createFileRoute, useNavigate, Outlet, useMatches } from "@tanstack/react-router";
import { requireV2Role, OPS_ROLES } from "@/lib/v2/route-guards";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef, PaginationState } from "@tanstack/react-table";
import { Plus, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/v2/PageHeader";
import { DataTable } from "@/components/v2/DataTable";
import { locationLabel } from "@/lib/utils";
import { ListToolbar, FilterSelect } from "@/components/v2/ListToolbar";
import { EntityFormModal } from "@/components/v2/EntityFormModal";
import { ConfirmDeleteDialog } from "@/components/v2/ConfirmDeleteDialog";
import { RoleGate } from "@/components/v2/RoleGate";
import { useCan } from "@/lib/v2/rbac";
import { v2FileUrl } from "@/lib/api/v2";
import { getUsers } from "@/lib/api/users";
import { DOCUMENT_TYPES } from "@/lib/v2/enums";
import {
  documents,
  useUploadDocument,
  toUploadInput,
  type VoltDocument,
} from "@/features/v2/documents/resource";
import { DocumentUploadForm } from "@/features/v2/documents/DocumentUploadForm";
import { TYPE_TO_CATEGORY_LABEL, categoryLabel } from "@/features/v2/documents/categories";

export const Route = createFileRoute("/_app/documents")({
  beforeLoad: () => requireV2Role(OPS_ROLES),
  component: DocumentsPage,
  head: () => ({ meta: [{ title: "Dokumen — VoltHub" }] }),
});

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—";

// Filter options use the 6 persisted backend types (1:1 with the query param).
const typeFilterOptions = DOCUMENT_TYPES.map((t) => ({ value: t, label: TYPE_TO_CATEGORY_LABEL[t] }));

function DocumentsPage() {
  const navigate = useNavigate();
  const canDelete = useCan("documents.delete");
  const matches = useMatches();
  const showingDetail = matches.some((m) => m.routeId === "/_app/documents/$id");
  const isAdmin = useCan("admin.access");

  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const [search, setSearch] = useState("");
  const [documentType, setDocumentType] = useState<string | undefined>();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteRow, setDeleteRow] = useState<VoltDocument | null>(null);

  const query = documents.useList({
    page: pagination.pageIndex + 1,
    limit: pagination.pageSize,
    search: search || undefined,
    documentType,
  });
  const uploadM = useUploadDocument();
  const removeM = documents.useRemove();

  // Resolve uploader names (createdBy is a user id). /api/users is admin-only, so
  // only fetch for admin-tier callers — others see a short id fallback.
  const usersQ = useQuery({
    queryKey: ["v2-doc-uploaders"],
    queryFn: () => getUsers(),
    enabled: isAdmin,
    staleTime: 5 * 60_000,
  });
  const uploaderName = useMemo(() => {
    const map = new Map((usersQ.data ?? []).map((u) => [u.id, u.name] as const));
    return (id?: string | null) => (id ? (map.get(id) ?? id.slice(0, 8)) : "—");
  }, [usersQ.data]);

  const columns = useMemo<ColumnDef<VoltDocument>[]>(
    () => [
      {
        header: "Nama Dokumen",
        accessorKey: "documentName",
        cell: ({ row }) => <span className="font-medium">{row.original.documentName}</span>,
      },
      {
        header: "Kategori",
        accessorKey: "documentType",
        cell: ({ row }) => <Badge variant="secondary">{categoryLabel(row.original.documentType)}</Badge>,
      },
      {
        header: "Gardu",
        id: "gardu",
        cell: ({ row }) =>
          row.original.location
            ? locationLabel(row.original.location.code, row.original.location.name)
            : "—",
      },
      {
        header: "Diunggah Oleh",
        id: "uploadedBy",
        cell: ({ row }) => uploaderName(row.original.createdBy),
      },
      {
        header: "Tanggal Unggah",
        id: "uploadDate",
        cell: ({ row }) => fmtDate(row.original.createdAt),
      },
      {
        id: "actions",
        header: () => <div className="text-right">Aksi</div>,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button asChild variant="ghost" size="icon" className="size-8" aria-label="Unduh">
              <a href={v2FileUrl(row.original.fileUrl)} target="_blank" rel="noreferrer">
                <Download className="size-4" />
              </a>
            </Button>
            {canDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-destructive hover:text-destructive"
                onClick={() => setDeleteRow(row.original)}
                aria-label="Hapus"
              >
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [canDelete, uploaderName],
  );

  const resetPage = () => setPagination((p) => ({ ...p, pageIndex: 0 }));

  if (showingDetail) return <Outlet />;

  return (
    <div>
      <PageHeader
        title="Dokumen"
        description="Foto gardu, inspeksi, HAR, work order, BAST, SOP, drawing, dan dokumen lainnya."
        actions={
          <RoleGate capability="documents.upload">
            <Button onClick={() => setUploadOpen(true)}>
              <Plus className="size-4" /> Unggah Dokumen
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
        onRowClick={(row) => navigate({ to: "/documents/$id", params: { id: row.id as string } })}
        toolbar={
          <ListToolbar
            searchPlaceholder="Cari nama dokumen…"
            onSearch={(v) => {
              setSearch(v);
              resetPage();
            }}
            filters={
              <FilterSelect
                value={documentType}
                onChange={(v) => {
                  setDocumentType(v);
                  resetPage();
                }}
                placeholder="Semua Kategori"
                options={typeFilterOptions}
              />
            }
          />
        }
      />

      <EntityFormModal open={uploadOpen} onOpenChange={setUploadOpen} title="Unggah Dokumen">
        <DocumentUploadForm
          submitting={uploadM.isPending}
          onCancel={() => setUploadOpen(false)}
          onSubmit={(values, file) =>
            uploadM.mutate(toUploadInput(values, file), { onSuccess: () => setUploadOpen(false) })
          }
        />
      </EntityFormModal>

      <ConfirmDeleteDialog
        open={!!deleteRow}
        onOpenChange={(o) => !o && setDeleteRow(null)}
        title={`Hapus ${deleteRow?.documentName ?? "dokumen"}?`}
        isPending={removeM.isPending}
        onConfirm={() => deleteRow && removeM.mutate(deleteRow.id, { onSuccess: () => setDeleteRow(null) })}
      />
    </div>
  );
}
