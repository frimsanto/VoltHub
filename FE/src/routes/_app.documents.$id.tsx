import { createFileRoute, useParams, useNavigate } from "@tanstack/react-router";
import { requireV2Role, OPS_ROLES } from "@/lib/v2/route-guards";
import { useState } from "react";
import { Loader2, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/v2/PageHeader";
import { locationLabel } from "@/lib/utils";
import { InfoGrid } from "@/components/v2/InfoGrid";
import { ConfirmDeleteDialog } from "@/components/v2/ConfirmDeleteDialog";
import { RoleGate } from "@/components/v2/RoleGate";
import { v2FileUrl } from "@/lib/api/v2";
import { documents } from "@/features/v2/documents/resource";
import { DocumentPreview } from "@/features/v2/documents/DocumentPreview";
import { categoryLabel } from "@/features/v2/documents/categories";

export const Route = createFileRoute("/_app/documents/$id")({
  beforeLoad: () => requireV2Role(OPS_ROLES),
  component: DocumentDetailPage,
  head: () => ({ meta: [{ title: "Detail Dokumen — VoltHub" }] }),
});

const fmtDateTime = (d?: string) =>
  d
    ? new Date(d).toLocaleString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

function DocumentDetailPage() {
  const { id } = useParams({ from: "/_app/documents/$id" });
  const navigate = useNavigate();
  const { data: doc, isLoading, isError, refetch } = documents.useOne(id);
  const removeM = documents.useRemove();
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 size-5 animate-spin" /> Memuat…
      </div>
    );
  }
  if (isError || !doc) {
    return (
      <div className="space-y-3 text-center">
        <p className="text-sm text-destructive">Gagal memuat dokumen.</p>
        <Button variant="outline" onClick={() => refetch()}>
          Coba lagi
        </Button>
      </div>
    );
  }

  const fileUrl = v2FileUrl(doc.fileUrl);
  const garduLabel = doc.location
    ? locationLabel(doc.location.code, doc.location.name)
    : null;
  const assetLabel = doc.asset
    ? `${doc.asset.assetCode ?? ""} — ${doc.asset.assetName ?? ""}`.replace(/^ — | — $/g, "")
    : null;

  return (
    <div>
      <PageHeader
        title="Detail Dokumen"
        description={doc.documentName}
        backTo="/documents"
        actions={
          <>
            {fileUrl && (
              <Button asChild variant="outline">
                <a href={fileUrl} target="_blank" rel="noreferrer" download>
                  <Download className="size-4" /> Unduh
                </a>
              </Button>
            )}
            <RoleGate capability="documents.delete">
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="size-4" /> Hapus
              </Button>
            </RoleGate>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Metadata</CardTitle>
          </CardHeader>
          <CardContent>
            <InfoGrid
              items={[
                { label: "Nama Dokumen", value: doc.documentName },
                { label: "Kategori", value: <Badge variant="secondary">{categoryLabel(doc.documentType)}</Badge> },
                { label: "Gardu", value: garduLabel },
                { label: "Aset", value: assetLabel },
                { label: "Tanggal Unggah", value: fmtDateTime(doc.createdAt) },
                { label: "Diunggah Oleh", value: doc.createdBy ?? null },
              ]}
            />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Pratinjau</CardTitle>
          </CardHeader>
          <CardContent>
            <DocumentPreview fileUrl={doc.fileUrl} name={doc.documentName} />
          </CardContent>
        </Card>
      </div>

      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Hapus ${doc.documentName}?`}
        isPending={removeM.isPending}
        onConfirm={() => removeM.mutate(doc.id, { onSuccess: () => navigate({ to: "/documents" }) })}
      />
    </div>
  );
}
