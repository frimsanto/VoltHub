import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMemo } from "react";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/v2/PageHeader";
import { InfoGrid } from "@/components/v2/InfoGrid";
import { ImportStatusBadge } from "@/components/v2/StatusBadge";
import { requireV2Role, ADMIN_TIER_ROLES } from "@/lib/v2/route-guards";
import {
  useImportJob,
  useImportErrors,
  importDomainLabel,
  parseImportErrorMessage,
} from "@/features/v2/imports/resource";

export const Route = createFileRoute("/_app/imports/$id")({
  beforeLoad: () => requireV2Role(ADMIN_TIER_ROLES),
  component: ImportDetailPage,
  head: () => ({ meta: [{ title: "Import — VoltHub" }] }),
});

const fmtDateTime = (d?: string | null) =>
  d ? new Date(d).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : "—";

function StatCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className={`text-2xl font-bold tabular-nums ${tone}`}>{value}</div>
      <div className="mt-0.5 text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

function ImportDetailPage() {
  const { id } = useParams({ from: "/_app/imports/$id" });
  const { data: job, isLoading, isError, refetch } = useImportJob(id);
  const errorsQ = useImportErrors(id);

  // Flatten each import_error into one row per failing column for the validation UI.
  const validationRows = useMemo(() => {
    const out: { key: string; rowNumber: number; column: string | null; message: string }[] = [];
    for (const e of errorsQ.data ?? []) {
      const segments = parseImportErrorMessage(e.errorMessage);
      segments.forEach((seg, i) => {
        out.push({ key: `${e.id}-${i}`, rowNumber: e.rowNumber, column: seg.column, message: seg.message });
      });
    }
    return out;
  }, [errorsQ.data]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 size-5 animate-spin" /> Memuat…
      </div>
    );
  }
  if (isError || !job) {
    return (
      <div className="space-y-3 text-center">
        <p className="text-sm text-destructive">Gagal memuat import job.</p>
        <Button variant="outline" onClick={() => refetch()}>Coba lagi</Button>
      </div>
    );
  }

  const failedCount = job.failedRows ?? errorsQ.data?.length ?? 0;
  const allValid = failedCount === 0 && (job.totalRows ?? 0) > 0;

  return (
    <div>
      <PageHeader
        title={job.fileName}
        description={<ImportStatusBadge status={job.status} />}
        backTo="/imports"
      />

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total Baris" value={job.totalRows ?? 0} tone="" />
        <StatCard label="Berhasil" value={job.successRows ?? 0} tone="text-green-600 dark:text-green-400" />
        <StatCard label="Gagal" value={failedCount} tone="text-destructive" />
        <StatCard label="Error Tercatat" value={job._count?.errors ?? errorsQ.data?.length ?? 0} tone="text-amber-600 dark:text-amber-400" />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Ringkasan Job</CardTitle>
        </CardHeader>
        <CardContent>
          <InfoGrid
            items={[
              { label: "Import ID", value: <code className="text-xs">{job.id}</code> },
              { label: "Domain", value: importDomainLabel(job.importType) },
              { label: "Status", value: <ImportStatusBadge status={job.status} /> },
              { label: "Mulai", value: fmtDateTime(job.startedAt) },
              { label: "Selesai", value: fmtDateTime(job.finishedAt) },
              { label: "Dibuat", value: fmtDateTime(job.createdAt) },
            ]}
          />
        </CardContent>
      </Card>

      {/* Validation result banner */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Hasil Validasi</CardTitle>
        </CardHeader>
        <CardContent>
          {allValid ? (
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
              <CheckCircle2 className="size-5" /> Semua {job.totalRows} baris lolos validasi dan berhasil diimpor.
            </div>
          ) : failedCount === 0 ? (
            <p className="text-sm text-muted-foreground">Tidak ada baris untuk divalidasi.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <XCircle className="size-5 text-destructive" />
              <span className="text-destructive">{failedCount} baris gagal validasi/diproses.</span>
              <Badge variant="outline" className="text-green-600 dark:text-green-400">{job.successRows ?? 0} berhasil</Badge>
              <Badge variant="outline" className="text-muted-foreground">{validationRows.length} pesan error</Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Failed rows + error messages (Row / Column / Error) */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Baris Gagal & Pesan Error</CardTitle>
        </CardHeader>
        <CardContent>
          {errorsQ.isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Memuat error…</p>
          ) : validationRows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Tidak ada error — semua baris valid.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Baris</TableHead>
                  <TableHead className="w-48">Kolom</TableHead>
                  <TableHead>Pesan Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {validationRows.map((r) => (
                  <TableRow key={r.key}>
                    <TableCell className="font-medium tabular-nums">{r.rowNumber}</TableCell>
                    <TableCell>
                      {r.column ? (
                        <code className="text-xs">{r.column}</code>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-destructive">{r.message}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
