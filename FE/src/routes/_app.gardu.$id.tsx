import { createFileRoute, useNavigate, useParams, Link } from "@tanstack/react-router";
import { requireV2Role, OPS_ROLES } from "@/lib/v2/route-guards";
import { useState } from "react";
import {
  Pencil,
  Trash2,
  Plus,
  Loader2,
  GitBranch,
  Boxes,
  ClipboardCheck,
  ShieldCheck,
  Ticket,
  FileText,
  MapPin,
  Activity,
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/v2/PageHeader";
import { InfoGrid } from "@/components/v2/InfoGrid";
import {
  ActiveBadge,
  AssetStatusBadge,
  RcStatusBadge,
  VipBadge,
  OperationalBadge,
  HarTypeBadge,
  HarReportStatusBadge,
} from "@/components/v2/StatusBadge";
import { EntityFormModal } from "@/components/v2/EntityFormModal";
import { ConfirmDeleteDialog } from "@/components/v2/ConfirmDeleteDialog";
import { RoleGate } from "@/components/v2/RoleGate";
import { useCan } from "@/lib/v2/rbac";
import {
  garduRcStatus,
  garduIsVip,
  garduOperational,
  harNumber,
  harType,
  harReportStatus,
} from "@/lib/v2/demo-adapter";
import { TicketStatusBadge, TicketPriorityBadge } from "@/components/v2/StatusBadge";
import { locations, type LocationFormValues } from "@/features/v2/locations/resource";
import { LocationForm } from "@/features/v2/locations/LocationForm";
import { feeders, type FeederFormValues } from "@/features/v2/feeders/resource";
import { FeederForm } from "@/features/v2/feeders/FeederForm";
import { assets } from "@/features/v2/assets/resource";
import { inspections } from "@/features/v2/inspections/resource";
import { harReports } from "@/features/v2/har/resource";
import { tickets } from "@/features/v2/tickets/resource";
import { GarduDocumentsTab } from "@/features/v2/documents/GarduDocumentsTab";
import { TrendChart } from "@/features/v2/dashboard/charts";
import { CHART_COLORS } from "@/lib/chart-config";
import {
  performance,
  buildPerfTrends,
  availabilityPct,
  rcStatusForDate,
} from "@/features/v2/performance/resource";

export const Route = createFileRoute("/_app/gardu/$id")({
  beforeLoad: () => requireV2Role(OPS_ROLES),
  component: GarduDetailPage,
  head: () => ({ meta: [{ title: "Detail Gardu — VoltHub" }] }),
});

const fmtDate = (d?: string) =>
  d
    ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
    : "—";

function GarduDetailPage() {
  const { id } = useParams({ from: "/_app/gardu/$id" });
  const navigate = useNavigate();
  const canWrite = useCan("locations.write");

  const { data: loc, isLoading, isError, refetch } = locations.useOne(id);
  const updateM = locations.useUpdate();
  const removeM = locations.useRemove();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [addFeederOpen, setAddFeederOpen] = useState(false);

  const feederQ = feeders.useList({ page: 1, limit: 100, locationId: id });
  const createFeeder = feeders.useCreate();
  const assetQ = assets.useList({ page: 1, limit: 100, locationId: id });
  const inspectionQ = inspections.useList({ page: 1, limit: 50, locationId: id });
  const harQ = harReports.useList({ page: 1, limit: 50, locationId: id });
  const ticketQ = tickets.useList({ page: 1, limit: 100, locationId: id });
  const perfQ = performance.useList({ page: 1, limit: 60, locationId: id });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 size-5 animate-spin" /> Memuat…
      </div>
    );
  }
  if (isError || !loc) {
    return (
      <div className="space-y-3 text-center">
        <p className="text-sm text-destructive">Gagal memuat data gardu.</p>
        <Button variant="outline" onClick={() => refetch()}>
          Coba lagi
        </Button>
      </div>
    );
  }

  // DEMO-derived status (RC/SCADA, VIP, operational) — see lib/v2/demo-adapter.ts
  const rc = garduRcStatus(loc.id ?? "");
  const vip = garduIsVip(loc.id ?? "");
  const operational = garduOperational(loc.id ?? "");

  const coordinate =
    loc.latitude != null && loc.longitude != null ? `${loc.latitude}, ${loc.longitude}` : null;
  const feederCount = feederQ.data?.items.length ?? 0;
  // A distribution gardu (TIPE: GARDU) is fed by one upstream penyulang; hubs
  // (GH/GI) instead REGISTER outgoing penyulang (counted above). The API embeds
  // the supplying feeder on the location detail.
  const supplyFeeder = (loc as { supplyFeeder?: { id?: string; feederName?: string } | null })
    .supplyFeeder;
  const isDistribution = loc.locationType === "GARDU";
  const assetCount = assetQ.data?.items.length ?? 0;
  const inspectionCount = inspectionQ.data?.items.length ?? 0;
  const harCount = harQ.data?.items.length ?? 0;

  // Real ticket records for this gardu, grouped Open / In Progress / Closed.
  const ticketItems = ticketQ.data?.items ?? [];
  const ticketCount = ticketItems.length;
  const openTickets = ticketItems.filter((t) => ["OPEN", "ASSIGNED"].includes(t.status)).length;
  const inProgressTickets = ticketItems.filter((t) => t.status === "IN_PROGRESS").length;
  const closedTickets = ticketItems.filter((t) => ["RESOLVED", "CLOSED"].includes(t.status)).length;

  // Performance records for this gardu (real) + derived trends.
  const perfItems = perfQ.data?.items ?? [];
  const perfCount = perfItems.length;
  const perfTrends = buildPerfTrends(perfItems);

  return (
    <div>
      <PageHeader
        title="Detail Gardu"
        description={loc.name}
        backTo="/gardu"
        actions={
          <RoleGate capability="locations.write">
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
        {/* A. Informasi Umum */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="size-4" /> Informasi Umum
            </CardTitle>
          </CardHeader>
          <CardContent>
            <InfoGrid
              items={[
                { label: "Nama Gardu", value: loc.name },
                { label: "Tipe", value: loc.locationType },
                { label: "UP3", value: loc.up3 },
                isDistribution
                  ? {
                      label: "Penyulang Penyuplai",
                      value: supplyFeeder ? (
                        <Link
                          className="text-primary hover:underline"
                          to="/penyulang/$id"
                          params={{ id: supplyFeeder.id as string }}
                        >
                          {supplyFeeder.feederName}
                        </Link>
                      ) : (
                        "—"
                      ),
                    }
                  : { label: "Penyulang", value: `${feederCount} penyulang` },
                { label: "Lokasi / Alamat", value: loc.address },
                { label: "Koordinat", value: coordinate },
                { label: "Status Data", value: <ActiveBadge active={loc.status} /> },
              ]}
            />
          </CardContent>
        </Card>

        {/* B. Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-4" /> Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status RC (SCADA)</span>
              <RcStatusBadge status={rc} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status VIP</span>
              <VipBadge vip={vip} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status Operasional</span>
              <OperationalBadge status={operational} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Open Work Order</span>
              <span className="font-semibold tabular-nums">{openTickets}</span>
            </div>
            <p className="border-t border-border pt-3 text-[11px] text-muted-foreground">
              Status RC/VIP/operasional menunggu integrasi feed OOP/INSCAN.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* C. Tabs */}
      <div className="mt-6">
        <Tabs defaultValue="asset">
          <TabsList>
            <TabsTrigger value="asset">
              <Boxes className="mr-1.5 size-4" /> Asset ({assetCount})
            </TabsTrigger>
            <TabsTrigger value="inspection">
              <ClipboardCheck className="mr-1.5 size-4" /> Inspection ({inspectionCount})
            </TabsTrigger>
            <TabsTrigger value="har">
              <ShieldCheck className="mr-1.5 size-4" /> HAR ({harCount})
            </TabsTrigger>
            <TabsTrigger value="ticket">
              <Ticket className="mr-1.5 size-4" /> Work Order ({ticketCount})
            </TabsTrigger>
            <TabsTrigger value="performance">
              <Activity className="mr-1.5 size-4" /> Performance ({perfCount})
            </TabsTrigger>
            <TabsTrigger value="dokumen">
              <FileText className="mr-1.5 size-4" /> Dokumen
            </TabsTrigger>
          </TabsList>

          {/* Asset tab — real data */}
          <TabsContent value="asset" className="mt-4">
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Boxes className="size-4" /> Aset di Gardu Ini
                </CardTitle>
                <Button asChild size="sm" variant="outline">
                  <Link to="/asset">Kelola Aset</Link>
                </Button>
              </CardHeader>
              <CardContent>
                {assetQ.isLoading ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">Memuat aset…</p>
                ) : assetCount === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Belum ada aset di gardu ini.
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
                      {assetQ.data?.items.map((a) => (
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
          </TabsContent>

          {/* Inspection tab — real data */}
          <TabsContent value="inspection" className="mt-4">
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ClipboardCheck className="size-4" /> Riwayat Inspeksi
                </CardTitle>
                <Button asChild size="sm" variant="outline">
                  <Link to="/inspection">Semua Inspeksi</Link>
                </Button>
              </CardHeader>
              <CardContent>
                {inspectionQ.isLoading ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">Memuat inspeksi…</p>
                ) : inspectionCount === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Belum ada inspeksi di gardu ini.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tanggal</TableHead>
                        <TableHead>Petugas</TableHead>
                        <TableHead>Temuan</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inspectionQ.data?.items.map((i) => (
                        <TableRow key={i.id}>
                          <TableCell className="font-medium">{fmtDate(i.inspectionDate)}</TableCell>
                          <TableCell>{i.inspector?.name ?? "—"}</TableCell>
                          <TableCell>{i._count?.findings ?? 0} temuan</TableCell>
                          <TableCell className="text-right">
                            <Button asChild variant="ghost" size="sm">
                              <Link to="/inspection/$id" params={{ id: i.id as string }}>
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
          </TabsContent>

          {/* HAR tab — real records for this gardu */}
          <TabsContent value="har" className="mt-4">
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="size-4" /> Riwayat HAR
                </CardTitle>
                <Button asChild size="sm" variant="outline">
                  <Link to="/har">Semua HAR</Link>
                </Button>
              </CardHeader>
              <CardContent>
                {harQ.isLoading ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">Memuat HAR…</p>
                ) : harCount === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Belum ada HAR di gardu ini.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nomor HAR</TableHead>
                        <TableHead>Tanggal</TableHead>
                        <TableHead>Jenis</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {harQ.data?.items.map((h) => (
                        <TableRow key={h.id}>
                          <TableCell className="font-medium">
                            {harNumber(h.id, h.reportDate)}
                          </TableCell>
                          <TableCell>{fmtDate(h.reportDate)}</TableCell>
                          <TableCell>
                            <HarTypeBadge type={harType(h.id)} />
                          </TableCell>
                          <TableCell>
                            <HarReportStatusBadge status={harReportStatus(h.id)} />
                          </TableCell>
                          <TableCell className="text-right">
                            <Button asChild variant="ghost" size="sm">
                              <Link to="/har/$id" params={{ id: h.id as string }}>
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
          </TabsContent>
          <TabsContent value="ticket" className="mt-4">
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Ticket className="size-4" /> Work Order
                </CardTitle>
                <Button asChild size="sm" variant="outline">
                  <Link to="/tickets">Semua Work Order</Link>
                </Button>
              </CardHeader>
              <CardContent>
                <div className="mb-4 grid grid-cols-3 gap-3">
                  <div className="rounded-lg border border-border p-3 text-center">
                    <p className="text-2xl font-bold tabular-nums text-blue-600 dark:text-blue-400">{openTickets}</p>
                    <p className="text-xs text-muted-foreground">Open</p>
                  </div>
                  <div className="rounded-lg border border-border p-3 text-center">
                    <p className="text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
                      {inProgressTickets}
                    </p>
                    <p className="text-xs text-muted-foreground">In Progress</p>
                  </div>
                  <div className="rounded-lg border border-border p-3 text-center">
                    <p className="text-2xl font-bold tabular-nums text-green-600 dark:text-green-400">
                      {closedTickets}
                    </p>
                    <p className="text-xs text-muted-foreground">Closed</p>
                  </div>
                </div>
                {ticketQ.isLoading ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Memuat Work Order…
                  </p>
                ) : ticketCount === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Belum ada Work Order di gardu ini.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>No. WO</TableHead>
                        <TableHead>Kategori</TableHead>
                        <TableHead>Prioritas</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ticketItems.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="font-medium">{t.ticketNumber}</TableCell>
                          <TableCell>{t.category ?? "—"}</TableCell>
                          <TableCell>
                            <TicketPriorityBadge priority={t.priority} />
                          </TableCell>
                          <TableCell>
                            <TicketStatusBadge status={t.status} />
                          </TableCell>
                          <TableCell className="text-right">
                            <Button asChild variant="ghost" size="sm">
                              <Link to="/tickets/$id" params={{ id: t.id as string }}>
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
          </TabsContent>
          <TabsContent value="performance" className="mt-4">
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity className="size-4" /> Performance Gardu
                </CardTitle>
                <Button asChild size="sm" variant="outline">
                  <Link to="/performance">Semua Performance</Link>
                </Button>
              </CardHeader>
              <CardContent>
                {perfQ.isLoading ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Memuat performance…
                  </p>
                ) : perfCount === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Belum ada data performance untuk gardu ini.
                  </p>
                ) : (
                  <div className="space-y-6">
                    <div>
                      <p className="mb-2 text-sm font-medium text-muted-foreground">
                        Tren Availability
                      </p>
                      <TrendChart
                        data={perfTrends}
                        series={[
                          { key: "Availability", color: CHART_COLORS.success, label: "Availability %" },
                        ]}
                        height={200}
                      />
                    </div>
                    <div>
                      <p className="mb-2 text-sm font-medium text-muted-foreground">
                        Riwayat Performance
                      </p>
                      <TrendChart
                        data={perfTrends}
                        series={[{ key: "Skor", color: "var(--color-chart-1)", label: "Performance Score" }]}
                        height={200}
                      />
                    </div>
                    <div>
                      <p className="mb-2 text-sm font-medium text-muted-foreground">Riwayat RC</p>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Tanggal</TableHead>
                            <TableHead>RC Status</TableHead>
                            <TableHead>Availability</TableHead>
                            <TableHead className="text-right">Skor</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {perfItems.map((p) => (
                            <TableRow key={p.id}>
                              <TableCell className="font-medium">
                                {fmtDate(p.performanceDate)}
                              </TableCell>
                              <TableCell>
                                <RcStatusBadge
                                  status={rcStatusForDate(p.locationId, p.performanceDate)}
                                />
                              </TableCell>
                              <TableCell>{availabilityPct(p)}%</TableCell>
                              <TableCell className="text-right tabular-nums">
                                {p.score != null ? p.score : "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="dokumen" className="mt-4">
            <GarduDocumentsTab locationId={id} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Penyulang (Feeders) — penyulang REGISTERED at this location (hubs:
          GH/GI). Distribution gardu instead show their supplying penyulang in
          the info grid above, so this registry section is hidden for them. */}
      {!isDistribution && (
        <Card className="mt-6">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <GitBranch className="size-4" /> Penyulang
            </CardTitle>
            <RoleGate capability="feeders.write">
              <Button size="sm" onClick={() => setAddFeederOpen(true)}>
                <Plus className="size-4" /> Tambah Penyulang
              </Button>
            </RoleGate>
          </CardHeader>
          <CardContent>
            {feederQ.isLoading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Memuat penyulang…</p>
            ) : feederCount === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Belum ada penyulang di gardu ini.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {feederQ.data?.items.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="font-medium">{f.feederName}</TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="ghost" size="sm">
                          <Link to="/penyulang/$id" params={{ id: f.id as string }}>
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
      )}

      {/* Edit gardu */}
      <EntityFormModal open={editOpen} onOpenChange={setEditOpen} title="Ubah Gardu">
        <LocationForm
          defaultValues={loc as LocationFormValues}
          submitting={updateM.isPending}
          onCancel={() => setEditOpen(false)}
          onSubmit={(values) =>
            updateM.mutate({ id, body: values }, { onSuccess: () => setEditOpen(false) })
          }
        />
      </EntityFormModal>

      {/* Add penyulang (gardu locked) */}
      <EntityFormModal
        open={addFeederOpen}
        onOpenChange={setAddFeederOpen}
        title="Tambah Penyulang"
      >
        <FeederForm
          lockLocation
          defaultValues={{ locationId: id } as FeederFormValues}
          submitting={createFeeder.isPending}
          onCancel={() => setAddFeederOpen(false)}
          onSubmit={(values) =>
            createFeeder.mutate(values, { onSuccess: () => setAddFeederOpen(false) })
          }
        />
      </EntityFormModal>

      {/* Delete gardu */}
      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Hapus ${loc.name}?`}
        isPending={removeM.isPending}
        onConfirm={() => removeM.mutate(id, { onSuccess: () => navigate({ to: "/gardu" }) })}
      />
    </div>
  );
}
