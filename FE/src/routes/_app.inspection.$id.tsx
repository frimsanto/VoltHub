import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import { requireV2Role, OPS_ROLES } from "@/lib/v2/route-guards";
import { useRef, useState } from "react";
import { Loader2, Plus, ImagePlus, Boxes } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/v2/PageHeader";
import { InfoGrid } from "@/components/v2/InfoGrid";
import { InspectionStatusBadge } from "@/components/v2/StatusBadge";
import { EntityFormModal } from "@/components/v2/EntityFormModal";
import { useCan } from "@/lib/v2/rbac";
import { v2FileUrl } from "@/lib/api/v2";
import {
  inspections,
  useAddFinding,
  useAddFindingPhoto,
  type InspectionFinding,
} from "@/features/v2/inspections/resource";
import { FindingForm } from "@/features/v2/inspections/FindingForm";
import { ReportExportMenu } from "@/features/v2/reports/ReportExportMenu";

export const Route = createFileRoute("/_app/inspection/$id")({
  beforeLoad: () => requireV2Role(OPS_ROLES),
  component: InspectionDetailPage,
  head: () => ({ meta: [{ title: "Inspeksi — VoltHub" }] }),
});

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "—";

function PhotoStrip({
  finding,
  inspectionId,
  canUpload,
}: {
  finding: InspectionFinding;
  inspectionId: string;
  canUpload: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const addPhoto = useAddFindingPhoto(inspectionId);

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {(finding.photos ?? []).map((p) => (
        <a
          key={p.id}
          href={v2FileUrl(p.photoUrl)}
          target="_blank"
          rel="noreferrer"
          title={p.caption ?? ""}
          className="block size-16 overflow-hidden rounded-md border border-border"
        >
          <img src={v2FileUrl(p.photoUrl)} alt={p.caption ?? "Foto"} className="size-full object-cover" />
        </a>
      ))}
      {canUpload && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) addPhoto.mutate({ findingId: finding.id, file });
              e.target.value = "";
            }}
          />
          <Button
            variant="outline"
            size="sm"
            className="h-16 w-16 flex-col gap-1 border-dashed"
            onClick={() => fileRef.current?.click()}
            disabled={addPhoto.isPending}
          >
            {addPhoto.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ImagePlus className="size-4" />
            )}
            <span className="text-[10px]">Foto</span>
          </Button>
        </>
      )}
    </div>
  );
}

function InspectionDetailPage() {
  const { id } = useParams({ from: "/_app/inspection/$id" });
  const canAddFinding = useCan("inspections.create");

  const { data: insp, isLoading, isError, refetch } = inspections.useOne(id);
  const addFinding = useAddFinding(id);
  const [findingOpen, setFindingOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 size-5 animate-spin" /> Memuat…
      </div>
    );
  }
  if (isError || !insp) {
    return (
      <div className="space-y-3 text-center">
        <p className="text-sm text-destructive">Gagal memuat inspeksi.</p>
        <Button variant="outline" onClick={() => refetch()}>Coba lagi</Button>
      </div>
    );
  }

  const locName = insp.location ? `${insp.location.name ?? ""}` : insp.locationId;

  return (
    <div>
      <PageHeader
        title={`Inspeksi ${fmtDate(insp.inspectionDate)}`}
        description={locName}
        backTo="/inspection"
        actions={<ReportExportMenu sourceType="INSPECTION" sourceId={id} variant="outline" />}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informasi Inspeksi</CardTitle>
        </CardHeader>
        <CardContent>
          <InfoGrid
            items={[
              { label: "Tanggal", value: fmtDate(insp.inspectionDate) },
              {
                label: "Lokasi",
                value: insp.location ? (
                  <Link className="text-primary hover:underline" to="/gardu/$id" params={{ id: insp.locationId as string }}>
                    {locName}
                  </Link>
                ) : (
                  locName
                ),
              },
              { label: "Inspector", value: insp.inspector?.name },
              { label: "Jumlah Temuan", value: insp.findings?.length ?? 0 },
              { label: "Catatan", value: insp.notes },
            ]}
          />
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Boxes className="size-4" /> Temuan
          </CardTitle>
          {canAddFinding && (
            <Button size="sm" onClick={() => setFindingOpen(true)}>
              <Plus className="size-4" /> Tambah Temuan
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {(insp.findings?.length ?? 0) === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Belum ada temuan.</p>
          ) : (
            insp.findings.map((f) => (
              <div key={f.id} className="rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {f.asset ? (
                      <Link
                        className="font-medium text-primary hover:underline"
                        to="/asset/$id" params={{ id: f.assetId as string }}
                      >
                        {f.asset.assetName}
                      </Link>
                    ) : (
                      <span className="font-medium">{f.assetId}</span>
                    )}
                    {f.asset?.assetType && (
                      <span className="text-xs text-muted-foreground">({f.asset.assetType})</span>
                    )}
                  </div>
                  <InspectionStatusBadge status={f.status} />
                </div>
                {f.finding && <p className="mt-2 text-sm"><span className="text-muted-foreground">Temuan: </span>{f.finding}</p>}
                {f.recommendation && (
                  <p className="mt-1 text-sm"><span className="text-muted-foreground">Rekomendasi: </span>{f.recommendation}</p>
                )}
                <PhotoStrip finding={f} inspectionId={id} canUpload={canAddFinding} />
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <EntityFormModal open={findingOpen} onOpenChange={setFindingOpen} title="Tambah Temuan">
        <FindingForm
          locationId={insp.locationId}
          submitting={addFinding.isPending}
          onCancel={() => setFindingOpen(false)}
          onSubmit={(values) => addFinding.mutate(values, { onSuccess: () => setFindingOpen(false) })}
        />
      </EntityFormModal>
    </div>
  );
}
