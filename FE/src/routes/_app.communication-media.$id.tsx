import { createFileRoute, useNavigate, useParams, Link } from "@tanstack/react-router";
import { requireV2Role, OPS_ROLES } from "@/lib/v2/route-guards";
import { useState } from "react";
import { Pencil, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/v2/PageHeader";
import { InfoGrid } from "@/components/v2/InfoGrid";
import { ActiveBadge } from "@/components/v2/StatusBadge";
import { EntityFormModal } from "@/components/v2/EntityFormModal";
import { ConfirmDeleteDialog } from "@/components/v2/ConfirmDeleteDialog";
import { RoleGate } from "@/components/v2/RoleGate";
import { useCan } from "@/lib/v2/rbac";
import { MEDIA_TYPE_LABELS, type MediaType } from "@/lib/v2/enums";
import { embeddedLocationLabel } from "@/features/v2/lookups";
import { commMedia, type CommMediaFormValues } from "@/features/v2/communication-media/resource";
import { CommMediaForm } from "@/features/v2/communication-media/CommMediaForm";

export const Route = createFileRoute("/_app/communication-media/$id")({
  beforeLoad: () => requireV2Role(OPS_ROLES),
  component: CommMediaDetailPage,
  head: () => ({ meta: [{ title: "Communication Media — VoltHub" }] }),
});

function CommMediaDetailPage() {
  const { id } = useParams({ from: "/_app/communication-media/$id" });
  const navigate = useNavigate();
  const canWrite = useCan("commMedia.write");

  const { data: media, isLoading, isError, refetch } = commMedia.useOne(id);
  const updateM = commMedia.useUpdate();
  const removeM = commMedia.useRemove();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Gardu name from the embedded relation the API returns (resolves for all
  // gardu; useLocationOptions is capped at 100 rows).
  const locationName = embeddedLocationLabel(media?.location);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 size-5 animate-spin" /> Memuat…
      </div>
    );
  }
  if (isError || !media) {
    return (
      <div className="space-y-3 text-center">
        <p className="text-sm text-destructive">Gagal memuat media.</p>
        <Button variant="outline" onClick={() => refetch()}>
          Coba lagi
        </Button>
      </div>
    );
  }

  const typeLabel = media.mediaType ? MEDIA_TYPE_LABELS[media.mediaType as MediaType] : "—";

  return (
    <div>
      <PageHeader
        title={typeLabel}
        description={media.provider ?? "Communication media"}
        backTo="/communication-media"
        actions={
          <RoleGate capability="commMedia.write">
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informasi Media</CardTitle>
        </CardHeader>
        <CardContent>
          <InfoGrid
            items={[
              { label: "Tipe", value: typeLabel },
              { label: "Provider", value: media.provider },
              {
                label: "Lokasi",
                value: locationName ? (
                  <Link
                    className="text-primary hover:underline"
                    to="/gardu/$id"
                    params={{ id: media.locationId as string }}
                  >
                    {locationName}
                  </Link>
                ) : (
                  media.locationId
                ),
              },
              { label: "Status", value: <ActiveBadge active={media.status} /> },
              { label: "Catatan", value: media.notes },
            ]}
          />
        </CardContent>
      </Card>

      <EntityFormModal open={editOpen} onOpenChange={setEditOpen} title="Ubah Communication Media">
        <CommMediaForm
          defaultValues={media as CommMediaFormValues}
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
        title="Hapus media komunikasi?"
        isPending={removeM.isPending}
        onConfirm={() =>
          removeM.mutate(id, { onSuccess: () => navigate({ to: "/communication-media" }) })
        }
      />
    </div>
  );
}
