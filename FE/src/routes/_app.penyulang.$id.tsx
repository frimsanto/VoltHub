import { createFileRoute, useNavigate, useParams, Link } from "@tanstack/react-router";
import { requireV2Role, OPS_ROLES } from "@/lib/v2/route-guards";
import { useState } from "react";
import { Pencil, Trash2, Loader2, Boxes } from "lucide-react";
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
import { AssetStatusBadge } from "@/components/v2/StatusBadge";
import { EntityFormModal } from "@/components/v2/EntityFormModal";
import { ConfirmDeleteDialog } from "@/components/v2/ConfirmDeleteDialog";
import { RoleGate } from "@/components/v2/RoleGate";
import { useCan } from "@/lib/v2/rbac";
import { embeddedLocationLabel } from "@/features/v2/lookups";
import { feeders, type FeederFormValues } from "@/features/v2/feeders/resource";
import { FeederForm } from "@/features/v2/feeders/FeederForm";
import { assets } from "@/features/v2/assets/resource";

export const Route = createFileRoute("/_app/penyulang/$id")({
  beforeLoad: () => requireV2Role(OPS_ROLES),
  component: FeederDetailPage,
  head: () => ({ meta: [{ title: "Penyulang — VoltHub" }] }),
});

function FeederDetailPage() {
  const { id } = useParams({ from: "/_app/penyulang/$id" });
  const navigate = useNavigate();
  const canWrite = useCan("feeders.write");

  const { data: feeder, isLoading, isError, refetch } = feeders.useOne(id);
  const updateM = feeders.useUpdate();
  const removeM = feeders.useRemove();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Gardu name from the embedded relation the API returns on the feeder, so it
  // resolves for every gardu (useLocationOptions is capped at 100 rows).
  const locationName = embeddedLocationLabel(feeder?.location);

  // Contract filters assets by locationId (not feederId): fetch the location's
  // assets then narrow to this feeder client-side.
  const assetQ = assets.useList(
    { page: 1, limit: 100, locationId: feeder?.locationId },
    { enabled: !!feeder?.locationId },
  );
  const feederAssets = (assetQ.data?.items ?? []).filter((a) => a.feederId === id);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 size-5 animate-spin" /> Memuat…
      </div>
    );
  }
  if (isError || !feeder) {
    return (
      <div className="space-y-3 text-center">
        <p className="text-sm text-destructive">Gagal memuat feeder.</p>
        <Button variant="outline" onClick={() => refetch()}>
          Coba lagi
        </Button>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={feeder.feederName}
        description="Detail penyulang"
        backTo="/penyulang"
        actions={
          <RoleGate capability="feeders.write">
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
          <CardTitle className="text-base">Informasi Penyulang</CardTitle>
        </CardHeader>
        <CardContent>
          <InfoGrid
            items={[
              { label: "Nama", value: feeder.feederName },
              {
                label: "Lokasi",
                value: locationName ? (
                  <Link
                    className="text-primary hover:underline"
                    to="/gardu/$id"
                    params={{ id: feeder.locationId as string }}
                  >
                    {locationName}
                  </Link>
                ) : (
                  feeder.locationId
                ),
              },
            ]}
          />
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Boxes className="size-4" /> Aset pada Penyulang
          </CardTitle>
        </CardHeader>
        <CardContent>
          {assetQ.isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Memuat assets…</p>
          ) : feederAssets.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Belum ada aset pada feeder ini.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Tipe</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {feederAssets.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.assetName}</TableCell>
                    <TableCell>{a.assetType}</TableCell>
                    <TableCell>
                      <AssetStatusBadge status={a.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link to="/asset/$id" params={{ id: a.id as string }}>
                          Lihat
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <EntityFormModal open={editOpen} onOpenChange={setEditOpen} title="Ubah Penyulang">
        <FeederForm
          defaultValues={feeder as FeederFormValues}
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
        title={`Hapus ${feeder.feederName}?`}
        isPending={removeM.isPending}
        onConfirm={() => removeM.mutate(id, { onSuccess: () => navigate({ to: "/penyulang" }) })}
      />
    </div>
  );
}
