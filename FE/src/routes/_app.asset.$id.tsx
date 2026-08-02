import { createFileRoute, useNavigate, useParams, Link } from "@tanstack/react-router";
import { requireV2Role, OPS_ROLES } from "@/lib/v2/route-guards";
import { useState } from "react";
import { Pencil, Trash2, Loader2, Plus, Radio, Network, Boxes } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
import { MEDIA_TYPE_LABELS, type MediaType } from "@/lib/v2/enums";
import { embeddedLocationLabel } from "@/features/v2/lookups";
import type { AssetWithRelations } from "@/features/v2/assets/resource";
import { assets } from "@/features/v2/assets/resource";
import { AssetEditModal } from "@/features/v2/assets/AssetEditModal";
import {
  useSimCards,
  useCreateSimCard,
  useUpdateSimCard,
  useDeleteSimCard,
  type SimCardFormValues,
} from "@/features/v2/assets/simcards";
import { SimCardForm } from "@/features/v2/assets/SimCardForm";
import { commMedia } from "@/features/v2/communication-media/resource";
import type { SimCard } from "@/lib/api/v2";

export const Route = createFileRoute("/_app/asset/$id")({
  beforeLoad: () => requireV2Role(OPS_ROLES),
  component: AssetDetailPage,
  head: () => ({ meta: [{ title: "Asset — VoltHub" }] }),
});

function AssetDetailPage() {
  const { id } = useParams({ from: "/_app/asset/$id" });
  const navigate = useNavigate();
  const canWrite = useCan("assets.write");

  const { data: asset, isLoading, isError, refetch } = assets.useOne(id);
  const removeM = assets.useRemove();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Gardu (and Penyulang) come from the relations the API embeds on the asset,
  // so they resolve for every gardu (useLocationOptions is capped at 100 rows).
  const rel = asset as AssetWithRelations | undefined;
  const locationName = embeddedLocationLabel(rel?.location);
  const feederName = rel?.feeder?.feederName ?? null;

  // Children + comm media for the asset's location.
  const siblingsQ = assets.useList(
    { page: 1, limit: 100, locationId: asset?.locationId },
    { enabled: !!asset?.locationId },
  );
  const children = (siblingsQ.data?.items ?? []).filter((a) => a.parentAssetId === id);
  const mediaQ = commMedia.useList(
    { page: 1, limit: 100, locationId: asset?.locationId },
    { enabled: !!asset?.locationId },
  );

  // SIM cards
  const simQ = useSimCards(id);
  const createSim = useCreateSimCard(id);
  const updateSim = useUpdateSimCard(id);
  const deleteSim = useDeleteSimCard(id);
  const [simCreateOpen, setSimCreateOpen] = useState(false);
  const [simEdit, setSimEdit] = useState<SimCard | null>(null);
  const [simDelete, setSimDelete] = useState<SimCard | null>(null);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 size-5 animate-spin" /> Memuat…
      </div>
    );
  }
  if (isError || !asset) {
    return (
      <div className="space-y-3 text-center">
        <p className="text-sm text-destructive">Gagal memuat asset.</p>
        <Button variant="outline" onClick={() => refetch()}>
          Coba lagi
        </Button>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={asset.assetName}
        description={asset.assetType}
        backTo="/asset"
        actions={
          <RoleGate capability="assets.write">
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
          <CardTitle className="text-base">Informasi Aset</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <InfoGrid
            items={[
              { label: "Nama", value: asset.assetName },
              { label: "Tipe", value: asset.assetType },
              { label: "Status", value: <AssetStatusBadge status={asset.status} /> },
              {
                label: "Lokasi",
                value: locationName ? (
                  <Link
                    className="text-primary hover:underline"
                    to="/gardu/$id"
                    params={{ id: asset.locationId as string }}
                  >
                    {locationName}
                  </Link>
                ) : (
                  asset.locationId
                ),
              },
              {
                label: "Penyulang",
                value: asset.feederId ? (
                  <Link
                    className="text-primary hover:underline"
                    to="/penyulang/$id"
                    params={{ id: asset.feederId as string }}
                  >
                    {feederName ?? "Lihat penyulang"}
                  </Link>
                ) : null,
              },
              {
                label: "Parent Aset",
                value: asset.parentAssetId ? (
                  <Link
                    className="text-primary hover:underline"
                    to="/asset/$id"
                    params={{ id: asset.parentAssetId as string }}
                  >
                    Lihat parent
                  </Link>
                ) : null,
              },
            ]}
          />
          <Separator />
          <InfoGrid
            items={[
              { label: "Merk", value: asset.brand },
              { label: "Model", value: asset.model },
              { label: "Serial Number", value: asset.serialNumber },
              { label: "Tahun Operasi", value: asset.tahunOperasi },
              { label: "Kapasitas", value: asset.capacity },
              { label: "Jumlah Baterai", value: asset.batteryCount },
              { label: "Protocol", value: asset.protocol },
              { label: "ASDU", value: asset.asdu },
              { label: "Link Address", value: asset.linkAddress },
              { label: "Pair / Channel", value: asset.pairChannel },
              { label: "Master IP 1", value: asset.masterIp1 },
              { label: "Master IP 2", value: asset.masterIp2 },
              { label: "Catatan", value: asset.notes },
            ]}
          />
        </CardContent>
      </Card>

      {/* Child assets (hierarchy) */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Boxes className="size-4" /> Child Assets
          </CardTitle>
        </CardHeader>
        <CardContent>
          {children.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Tidak ada child aset.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Tipe</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {children.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.assetName}</TableCell>
                    <TableCell>{c.assetType}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link to="/asset/$id" params={{ id: c.id as string }}>
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

      {/* SIM cards */}
      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Radio className="size-4" /> SIM Cards
          </CardTitle>
          <RoleGate capability="assets.write">
            <Button size="sm" onClick={() => setSimCreateOpen(true)}>
              <Plus className="size-4" /> Tambah SIM
            </Button>
          </RoleGate>
        </CardHeader>
        <CardContent>
          {simQ.isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Memuat SIM…</p>
          ) : (simQ.data?.length ?? 0) === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Belum ada SIM card.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Slot</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Nomor</TableHead>
                  <TableHead>ICCID</TableHead>
                  <TableHead>IP</TableHead>
                  {canWrite && <TableHead className="text-right">Aksi</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {simQ.data?.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.simSlot}</TableCell>
                    <TableCell>{s.provider ?? "—"}</TableCell>
                    <TableCell>{s.phoneNumber ?? "—"}</TableCell>
                    <TableCell>{s.iccid ?? "—"}</TableCell>
                    <TableCell>{s.ipAddress ?? "—"}</TableCell>
                    {canWrite && (
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => setSimEdit(s)}
                          aria-label="Ubah SIM"
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive"
                          onClick={() => setSimDelete(s)}
                          aria-label="Hapus SIM"
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

      {/* Communication media at the asset's location */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Network className="size-4" /> Communication Media (Lokasi)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {mediaQ.isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Memuat media…</p>
          ) : (mediaQ.data?.items.length ?? 0) === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Belum ada media komunikasi di lokasi ini.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipe</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mediaQ.data?.items.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">
                      {m.mediaType ? MEDIA_TYPE_LABELS[m.mediaType as MediaType] : "—"}
                    </TableCell>
                    <TableCell>{m.provider ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link to="/communication-media/$id" params={{ id: m.id as string }}>
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

      {/* Edit / delete asset */}
      <AssetEditModal
        assetId={id}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSuccess={() => refetch()}
      />
      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Hapus ${asset.assetName}?`}
        isPending={removeM.isPending}
        onConfirm={() => removeM.mutate(id, { onSuccess: () => navigate({ to: "/asset" }) })}
      />

      {/* SIM create */}
      <EntityFormModal open={simCreateOpen} onOpenChange={setSimCreateOpen} title="Tambah SIM Card">
        <SimCardForm
          submitting={createSim.isPending}
          onCancel={() => setSimCreateOpen(false)}
          onSubmit={(values) =>
            createSim.mutate(values, { onSuccess: () => setSimCreateOpen(false) })
          }
        />
      </EntityFormModal>

      {/* SIM edit */}
      <EntityFormModal
        open={!!simEdit}
        onOpenChange={(o) => !o && setSimEdit(null)}
        title="Ubah SIM Card"
      >
        {simEdit && (
          <SimCardForm
            defaultValues={simEdit as SimCardFormValues}
            submitting={updateSim.isPending}
            onCancel={() => setSimEdit(null)}
            onSubmit={(values) =>
              updateSim.mutate(
                { id: simEdit.id as string, body: values },
                { onSuccess: () => setSimEdit(null) },
              )
            }
          />
        )}
      </EntityFormModal>

      {/* SIM delete */}
      <ConfirmDeleteDialog
        open={!!simDelete}
        onOpenChange={(o) => !o && setSimDelete(null)}
        title={`Hapus SIM slot ${simDelete?.simSlot ?? ""}?`}
        isPending={deleteSim.isPending}
        onConfirm={() =>
          simDelete &&
          deleteSim.mutate(simDelete.id as string, { onSuccess: () => setSimDelete(null) })
        }
      />
    </div>
  );
}
