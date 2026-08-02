// VoltHub — Documents tab for the Detail Gardu page. Lists documents related to
// one location and supports upload (gardu pre-locked). Reuses the existing
// document endpoints (filtered by locationId).
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { FileText, Plus, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EntityFormModal } from "@/components/v2/EntityFormModal";
import { ConfirmDeleteDialog } from "@/components/v2/ConfirmDeleteDialog";
import { RoleGate } from "@/components/v2/RoleGate";
import { useCan } from "@/lib/v2/rbac";
import { v2FileUrl } from "@/lib/api/v2";
import { documents, useUploadDocument, toUploadInput, type VoltDocument } from "./resource";
import { DocumentUploadForm } from "./DocumentUploadForm";
import { categoryLabel } from "./categories";

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—";

export function GarduDocumentsTab({ locationId }: { locationId: string }) {
  const canDelete = useCan("documents.delete");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteRow, setDeleteRow] = useState<VoltDocument | null>(null);

  const query = documents.useList({ page: 1, limit: 100, locationId });
  const uploadM = useUploadDocument();
  const removeM = documents.useRemove();

  const items = query.data?.items ?? [];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="size-4" /> Dokumen Gardu ({items.length})
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to="/documents">Semua Dokumen</Link>
          </Button>
          <RoleGate capability="documents.upload">
            <Button size="sm" onClick={() => setUploadOpen(true)}>
              <Plus className="size-4" /> Unggah
            </Button>
          </RoleGate>
        </div>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Memuat dokumen…</p>
        ) : items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Belum ada dokumen di gardu ini.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama Dokumen</TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead>Tanggal Unggah</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">
                    <Link to="/documents/$id" params={{ id: d.id as string }} className="hover:underline">
                      {d.documentName}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{categoryLabel(d.documentType)}</Badge>
                  </TableCell>
                  <TableCell>{fmtDate(d.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button asChild variant="ghost" size="icon" className="size-8" aria-label="Unduh">
                        <a href={v2FileUrl(d.fileUrl)} target="_blank" rel="noreferrer">
                          <Download className="size-4" />
                        </a>
                      </Button>
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteRow(d)}
                          aria-label="Hapus"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <EntityFormModal open={uploadOpen} onOpenChange={setUploadOpen} title="Unggah Dokumen Gardu">
        <DocumentUploadForm
          submitting={uploadM.isPending}
          lockLocationId={locationId}
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
    </Card>
  );
}
