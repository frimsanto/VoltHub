import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { requireV2Role, OPS_ROLES } from "@/lib/v2/route-guards";
import { useState } from "react";
import {
  Loader2,
  Plus,
  FileDown,
  Pencil,
  Trash2,
  Boxes,
  Paperclip,
  History,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/v2/PageHeader";
import { InfoGrid } from "@/components/v2/InfoGrid";
import { HarStatusBadge, HarTypeBadge, HarReportStatusBadge } from "@/components/v2/StatusBadge";
import { EntityFormModal } from "@/components/v2/EntityFormModal";
import { ConfirmDeleteDialog } from "@/components/v2/ConfirmDeleteDialog";
import { RoleGate } from "@/components/v2/RoleGate";
import { Timeline } from "@/components/Timeline";
import { useCan } from "@/lib/v2/rbac";
import {
  harNumber,
  harType,
  harReportStatus,
  harCreatedBy,
  harTimeline,
  harAttachments,
} from "@/lib/v2/demo-adapter";
import {
  harReports,
  useAddHarDetail,
  useUpdateHarDetail,
  useDeleteHarDetail,
  type HarDetail,
  type HarDetailFormValues,
  type HarReportFormValues,
} from "@/features/v2/har/resource";
import { HarDetailForm } from "@/features/v2/har/HarDetailForm";
import { HarReportForm } from "@/features/v2/har/HarReportForm";
import { ReportExportMenu } from "@/features/v2/reports/ReportExportMenu";

export const Route = createFileRoute("/_app/har/$id")({
  beforeLoad: () => requireV2Role(OPS_ROLES),
  component: HarDetailPage,
  head: () => ({ meta: [{ title: "HAR — VoltHub" }] }),
});

const fmtDate = (d?: string) =>
  d
    ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
    : "—";
const fmtDateTime = (d: Date) =>
  d.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const ACTIVITY_LABELS: Record<string, string> = {
  created: "Dibuat",
  updated: "Diperbarui",
  submitted: "Diajukan",
  approved: "Disetujui",
  validated: "Divalidasi",
};

function HarDetailPage() {
  const { id } = useParams({ from: "/_app/har/$id" });
  const canAddDetail = useCan("har.create");
  const canWriteDetail = useCan("har.detail.write");

  const { data: har, isLoading, isError, refetch } = harReports.useOne(id);
  const addDetail = useAddHarDetail(id);
  const updateDetail = useUpdateHarDetail(id);
  const deleteDetail = useDeleteHarDetail(id);
  const updateReport = harReports.useUpdate();

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<HarDetail | null>(null);
  const [deleteRow, setDeleteRow] = useState<HarDetail | null>(null);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 size-5 animate-spin" /> Memuat…
      </div>
    );
  }
  if (isError || !har) {
    return (
      <div className="space-y-3 text-center">
        <p className="text-sm text-destructive">Gagal memuat HAR.</p>
        <Button variant="outline" onClick={() => refetch()}>
          Coba lagi
        </Button>
      </div>
    );
  }

  const locName = har.location
    ? `${har.location.name ?? ""}`
    : har.locationId;
  const number = harNumber(har.id, har.reportDate);
  const author = harCreatedBy(har.id);
  const timeline = harTimeline(har.id, har.reportDate);
  const attachments = harAttachments(har.id, har.reportDate);

  return (
    <div>
      <PageHeader
        title={number}
        description={locName}
        backTo="/har"
        actions={
          <>
            <RoleGate capability="har.create">
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil className="size-4" /> Ubah
              </Button>
            </RoleGate>
            <ReportExportMenu sourceType="HAR" sourceId={id} variant="outline" />
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Summary */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Ringkasan HAR</CardTitle>
          </CardHeader>
          <CardContent>
            <InfoGrid
              items={[
                { label: "Nomor HAR", value: number },
                {
                  label: "Gardu",
                  value: har.location ? (
                    <Link
                      className="text-primary hover:underline"
                      to="/gardu/$id" params={{ id: har.locationId as string }}
                    >
                      {locName}
                    </Link>
                  ) : (
                    locName
                  ),
                },
                { label: "Tanggal", value: fmtDate(har.reportDate) },
                { label: "Jenis", value: <HarTypeBadge type={harType(har.id)} /> },
                {
                  label: "Status",
                  value: <HarReportStatusBadge status={harReportStatus(har.id)} />,
                },
                { label: "Dibuat Oleh", value: author.name },
                { label: "Jumlah Detail Aset", value: har.details?.length ?? 0 },
              ]}
            />
          </CardContent>
        </Card>

        {/* Timeline */}
        <Timeline events={timeline} />
      </div>

      {/* Detail Aset */}
      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Boxes className="size-4" /> Detail Aset
          </CardTitle>
          {canAddDetail && (
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="size-4" /> Tambah Detail
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {(har.details?.length ?? 0) === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Belum ada detail aset.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Aset</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Analisa</TableHead>
                  <TableHead>Catatan</TableHead>
                  {canWriteDetail && <TableHead className="text-right">Aksi</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {har.details.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">
                      {d.asset ? (
                        <Link
                          className="text-primary hover:underline"
                          to="/asset/$id" params={{ id: d.assetId as string }}
                        >
                          {d.asset.assetName}
                        </Link>
                      ) : (
                        d.assetId
                      )}
                    </TableCell>
                    <TableCell>
                      <HarStatusBadge status={d.status} />
                    </TableCell>
                    <TableCell className="max-w-[240px] truncate">{d.analysis ?? "—"}</TableCell>
                    <TableCell className="max-w-[240px] truncate">{d.notes ?? "—"}</TableCell>
                    {canWriteDetail && (
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => setEditRow(d)}
                          aria-label="Ubah detail"
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive"
                          onClick={() => setDeleteRow(d)}
                          aria-label="Hapus detail"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Attachments */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Paperclip className="size-4" /> Lampiran
            </CardTitle>
            <RoleGate capability="har.create">
              <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                <Plus className="size-4" /> Unggah
              </Button>
            </RoleGate>
          </CardHeader>
          <CardContent>
            {attachments.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Belum ada lampiran.</p>
            ) : (
              <ul className="divide-y divide-border">
                {attachments.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 py-2.5">
                    <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                      <FileText className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{a.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {a.type} · {(a.sizeKb / 1024).toFixed(1)} MB
                      </div>
                    </div>
                    <Button variant="ghost" size="sm">
                      <FileDown className="size-4" /> Unduh
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Activity history */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="size-4" /> Riwayat Aktivitas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {timeline.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium">{ACTIVITY_LABELS[e.type] ?? e.type}</span>
                    <span className="text-muted-foreground"> oleh {e.user?.name ?? "—"}</span>
                    {e.details && <p className="text-xs text-muted-foreground">{e.details}</p>}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {fmtDateTime(e.timestamp)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Edit report (reuse create form) */}
      <EntityFormModal open={editOpen} onOpenChange={setEditOpen} title="Ubah HAR">
        <HarReportForm
          isEdit
          defaultValues={
            {
              locationId: har.locationId,
              reportDate: har.reportDate?.slice(0, 10),
            } as HarReportFormValues
          }
          submitting={updateReport.isPending}
          onCancel={() => setEditOpen(false)}
          onSubmit={(values) =>
            updateReport.mutate({ id, body: values }, { onSuccess: () => setEditOpen(false) })
          }
        />
      </EntityFormModal>

      {/* Add detail */}
      <EntityFormModal open={addOpen} onOpenChange={setAddOpen} title="Tambah Detail HAR">
        <HarDetailForm
          locationId={har.locationId}
          submitting={addDetail.isPending}
          onCancel={() => setAddOpen(false)}
          onSubmit={(values) => addDetail.mutate(values, { onSuccess: () => setAddOpen(false) })}
        />
      </EntityFormModal>

      {/* Edit detail */}
      <EntityFormModal
        open={!!editRow}
        onOpenChange={(o) => !o && setEditRow(null)}
        title="Ubah Detail HAR"
      >
        {editRow && (
          <HarDetailForm
            locationId={har.locationId}
            isEdit
            defaultValues={editRow as HarDetailFormValues}
            submitting={updateDetail.isPending}
            onCancel={() => setEditRow(null)}
            onSubmit={(values) =>
              updateDetail.mutate(
                {
                  detailId: editRow.id,
                  body: { status: values.status, analysis: values.analysis, notes: values.notes },
                },
                { onSuccess: () => setEditRow(null) },
              )
            }
          />
        )}
      </EntityFormModal>

      {/* Delete detail */}
      <ConfirmDeleteDialog
        open={!!deleteRow}
        onOpenChange={(o) => !o && setDeleteRow(null)}
        title={`Hapus detail ${deleteRow?.asset?.assetName ?? "aset"}?`}
        description="Detail HAR akan dihapus permanen."
        isPending={deleteDetail.isPending}
        onConfirm={() =>
          deleteRow && deleteDetail.mutate(deleteRow.id, { onSuccess: () => setDeleteRow(null) })
        }
      />
    </div>
  );
}
