import { createFileRoute, useNavigate, useParams, Link } from "@tanstack/react-router";
import { requireV2Role, OPS_ROLES } from "@/lib/v2/route-guards";
import { useState } from "react";
import {
  Pencil,
  Trash2,
  Loader2,
  Ticket as TicketIcon,
  Clock,
  Paperclip,
  History,
  CheckCircle2,
  UserPlus,
  FilePlus2,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/v2/PageHeader";
import { InfoGrid } from "@/components/v2/InfoGrid";
import { TicketStatusBadge, TicketPriorityBadge } from "@/components/v2/StatusBadge";
import { EntityFormModal } from "@/components/v2/EntityFormModal";
import { ConfirmDeleteDialog } from "@/components/v2/ConfirmDeleteDialog";
import { RoleGate } from "@/components/v2/RoleGate";
import { useCan } from "@/lib/v2/rbac";
import { v2FileUrl } from "@/lib/api/v2";
import { documents } from "@/features/v2/documents/resource";
import {
  tickets,
  useTicketActivity,
  type TicketFormValues,
} from "@/features/v2/tickets/resource";
import { TicketForm } from "@/features/v2/tickets/TicketForm";

export const Route = createFileRoute("/_app/tickets/$id")({
  beforeLoad: () => requireV2Role(OPS_ROLES),
  component: TicketDetailPage,
  head: () => ({ meta: [{ title: "Detail Work Order — VoltHub" }] }),
});

const fmtDateTime = (d?: string | null) =>
  d
    ? new Date(d).toLocaleString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

const ACTION_LABELS: Record<string, string> = {
  CREATE: "Work Order dibuat",
  UPDATE: "Work Order diperbarui",
  STATUS_CHANGE: "Perubahan status",
  DELETE: "Work Order dihapus",
};

function TicketDetailPage() {
  const { id } = useParams({ from: "/_app/tickets/$id" });
  const navigate = useNavigate();
  const canWrite = useCan("tickets.write");

  const { data: ticket, isLoading, isError, refetch } = tickets.useOne(id);
  const updateM = tickets.useUpdate();
  const removeM = tickets.useRemove();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Attachments: gardu documents tagged with this ticket number ([TKT-…]).
  const docQ = documents.useList(
    { page: 1, limit: 100, locationId: ticket?.locationId },
    { enabled: !!ticket?.locationId },
  );
  const attachments = (docQ.data?.items ?? []).filter((d) =>
    d.documentName?.startsWith(`[${ticket?.ticketNumber}]`),
  );

  // Activity history (audit trail) — admin only.
  const activityQ = useTicketActivity(id, canWrite);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 size-5 animate-spin" /> Memuat…
      </div>
    );
  }
  if (isError || !ticket) {
    return (
      <div className="space-y-3 text-center">
        <p className="text-sm text-destructive">Gagal memuat Work Order.</p>
        <Button variant="outline" onClick={() => refetch()}>
          Coba lagi
        </Button>
      </div>
    );
  }

  // Timeline — derived from the ticket's own lifecycle fields (visible to all).
  const timeline = [
    { icon: FilePlus2, label: "Work Order dibuat", at: ticket.openedAt ?? ticket.createdAt },
    ticket.assignee
      ? { icon: UserPlus, label: `Ditugaskan ke ${ticket.assignee.name}`, at: ticket.updatedAt }
      : null,
    ticket.closedAt ? { icon: CheckCircle2, label: "Work Order ditutup", at: ticket.closedAt } : null,
  ].filter(Boolean) as { icon: typeof Clock; label: string; at?: string | null }[];

  return (
    <div>
      <PageHeader
        title={ticket.ticketNumber}
        description={ticket.category ?? "Work Order"}
        backTo="/tickets"
        actions={
          <RoleGate capability="tickets.write">
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="size-4" /> Ubah
            </Button>
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="size-4" /> Hapus
            </Button>
          </RoleGate>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Summary */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TicketIcon className="size-4" /> Ringkasan
            </CardTitle>
          </CardHeader>
          <CardContent>
            <InfoGrid
              items={[
                { label: "No. WO", value: ticket.ticketNumber },
                {
                  label: "Gardu",
                  value: ticket.location ? (
                    <Link
                      className="text-primary hover:underline"
                      to="/gardu/$id" params={{ id: ticket.locationId as string }}
                    >
                      {ticket.location.code} — {ticket.location.name}
                    </Link>
                  ) : (
                    ticket.locationId
                  ),
                },
                { label: "Kategori", value: ticket.category },
                { label: "Prioritas", value: <TicketPriorityBadge priority={ticket.priority} /> },
                { label: "Status", value: <TicketStatusBadge status={ticket.status} /> },
                { label: "Ditugaskan Ke", value: ticket.assignee?.name },
                { label: "Dibuat", value: fmtDateTime(ticket.openedAt ?? ticket.createdAt) },
                { label: "Ditutup", value: fmtDateTime(ticket.closedAt) },
                { label: "Deskripsi", value: ticket.notes },
              ]}
            />
          </CardContent>
        </Card>

        {/* Timeline */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="size-4" /> Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-4">
              {timeline.map((t, i) => (
                <li key={i} className="flex gap-3">
                  <div className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                    <t.icon className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{t.label}</p>
                    <p className="text-xs text-muted-foreground">{fmtDateTime(t.at)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>

      {/* Attachments */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Paperclip className="size-4" /> Lampiran
          </CardTitle>
        </CardHeader>
        <CardContent>
          {docQ.isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Memuat lampiran…</p>
          ) : attachments.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Belum ada lampiran pada Work Order ini.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {attachments.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 py-2.5">
                  <span className="flex min-w-0 items-center gap-2 text-sm">
                    <Paperclip className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">
                      {d.documentName?.replace(`[${ticket.ticketNumber}] `, "")}
                    </span>
                  </span>
                  <a
                    href={v2FileUrl(d.fileUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex shrink-0 items-center gap-1 text-sm text-primary hover:underline"
                  >
                    Buka <ExternalLink className="size-3.5" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Activity History */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="size-4" /> Riwayat Aktivitas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!canWrite ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Riwayat aktivitas hanya tersedia untuk admin.
            </p>
          ) : activityQ.isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Memuat aktivitas…</p>
          ) : (activityQ.data?.items.length ?? 0) === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Belum ada aktivitas.</p>
          ) : (
            <ul className="divide-y divide-border">
              {activityQ.data?.items.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 py-2.5">
                  <span className="text-sm">
                    {ACTION_LABELS[a.action] ?? a.action}
                    {a.performer?.name && (
                      <span className="text-muted-foreground"> · oleh {a.performer.name}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {fmtDateTime(a.performedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Edit */}
      <EntityFormModal open={editOpen} onOpenChange={setEditOpen} title="Edit Work Order">
        <TicketForm
          mode="edit"
          defaultValues={ticket as TicketFormValues}
          submitting={updateM.isPending}
          onCancel={() => setEditOpen(false)}
          onSubmit={(values) =>
            updateM.mutate({ id, body: values }, { onSuccess: () => setEditOpen(false) })
          }
        />
      </EntityFormModal>

      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Hapus Work Order ${ticket.ticketNumber}?`}
        isPending={removeM.isPending}
        onConfirm={() => removeM.mutate(id, { onSuccess: () => navigate({ to: "/tickets" }) })}
      />
    </div>
  );
}
