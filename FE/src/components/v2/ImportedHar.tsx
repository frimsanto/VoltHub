// VoltHub V2 — badge + detail dialog for historical HAR rows sourced from the
// Excel import (har_gardu_records), shown alongside native HAR GH/MP reports.
// These rows have no workflow status and no linked Work Order — read-only.
// Klon dari ImportedInspeksi.tsx dengan field khusus HAR (jenis pekerjaan,
// penyebab/analisa gangguan, status pekerjaan).
import { History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—";

/** STATUS column badge for imported HAR rows — SCADA connectivity (proxy dari STATUS GARDU SESUDAH), bukan status alur. */
export function ImportedHarStatusBadge({ statusScada }: { statusScada?: string | null }) {
  if (statusScada === "INSCAN") {
    return (
      <Badge className="border-transparent bg-green-500/15 font-medium text-green-700 dark:text-green-400">
        INSCAN
      </Badge>
    );
  }
  if (statusScada === "OOP") {
    return (
      <Badge className="border-transparent bg-red-500/15 font-medium text-red-700 dark:text-red-400">
        OOP
      </Badge>
    );
  }
  return <Badge className="border-transparent bg-muted font-medium text-muted-foreground">Data Historis</Badge>;
}

/** Small blue marker next to the date so imported HAR rows read as distinct from live reports. */
export function ImportedHarTag() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-400">
      <History className="size-3" /> Import
    </span>
  );
}

// HAR verdicts: BAIK | RUSAK | PERLU CEK LEBIH LANJUT (amber fallback).
const KESIMPULAN_STYLES: Record<string, string> = {
  BAIK: "bg-green-500/15 text-green-700 dark:text-green-400 border-transparent",
  RUSAK: "bg-red-500/15 text-red-700 dark:text-red-400 border-transparent",
};

function KesimpulanRow({ label, kesimpulan, keterangan }: { label: string; kesimpulan?: string | null; keterangan?: string | null }) {
  return (
    <div className="space-y-1 rounded-lg border border-border/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {kesimpulan ? (
          <Badge className={cn("font-medium", KESIMPULAN_STYLES[kesimpulan] ?? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-transparent")}>
            {kesimpulan}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>
      {keterangan && <p className="text-xs text-muted-foreground">{keterangan}</p>}
    </div>
  );
}

export interface ImportedHarDetailData {
  id: string;
  kodeGardu?: string | null;
  up3?: string | null;
  penyulang?: string | null;
  pelaksana?: string | null;
  reportDate?: string | null;
  jenisPekerjaan?: string | null;
  statusScada?: string | null;
  statusRc?: string | null;
  statusPekerjaan?: string | null;
  penyebabGangguan?: string[] | null;
  analisaGangguan?: string | null;
  catatan?: string | null;
  kesimpulanRectifier?: string | null;
  keteranganRectifier?: string | null;
  kesimpulanBaterai?: string | null;
  keteranganBaterai?: string | null;
  kesimpulanRtu?: string | null;
  keteranganRtu?: string | null;
  kesimpulanMedia?: string | null;
  keteranganMedia?: string | null;
  location?: { name?: string | null } | null;
}

export function ImportedHarDetailDialog({
  open,
  onOpenChange,
  data,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ImportedHarDetailData | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {data && (
          <>
            <DialogHeader>
              <DialogTitle>{data.location?.name ?? data.kodeGardu ?? "Data Historis"}</DialogTitle>
              <DialogDescription>
                Data HAR historis dari import Excel · {fmtDate(data.reportDate)} — tidak tertaut Work Order.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 text-sm">
              <div className="flex flex-wrap gap-2">
                {data.jenisPekerjaan && <Badge variant="outline">{data.jenisPekerjaan}</Badge>}
                <Badge variant="outline">UP3: {data.up3 ?? "—"}</Badge>
                {data.penyulang && <Badge variant="outline">Penyulang: {data.penyulang}</Badge>}
                <Badge variant="outline">Pelaksana: {data.pelaksana ?? "—"}</Badge>
              </div>

              {(data.penyebabGangguan?.length || data.analisaGangguan) && (
                <div className="space-y-1 rounded-lg border border-border/60 p-3">
                  {!!data.penyebabGangguan?.length && (
                    <p className="text-xs">
                      <span className="text-muted-foreground">Penyebab Gangguan:</span> {data.penyebabGangguan.join("; ")}
                    </p>
                  )}
                  {data.analisaGangguan && (
                    <p className="text-xs">
                      <span className="text-muted-foreground">Analisa Gangguan:</span> {data.analisaGangguan}
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <KesimpulanRow label="Rectifier" kesimpulan={data.kesimpulanRectifier} keterangan={data.keteranganRectifier} />
                <KesimpulanRow label="Baterai" kesimpulan={data.kesimpulanBaterai} keterangan={data.keteranganBaterai} />
                <KesimpulanRow label="RTU" kesimpulan={data.kesimpulanRtu} keterangan={data.keteranganRtu} />
                <KesimpulanRow label="Media" kesimpulan={data.kesimpulanMedia} keterangan={data.keteranganMedia} />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <ImportedHarStatusBadge statusScada={data.statusScada} />
                {data.statusPekerjaan && <Badge variant="outline">Pekerjaan: {data.statusPekerjaan}</Badge>}
                {data.statusRc && <Badge variant="outline">Status RC: {data.statusRc}</Badge>}
              </div>

              {data.catatan && (
                <div className="space-y-1 border-t border-border/50 pt-3">
                  <p className="text-xs text-muted-foreground">Catatan Lapangan</p>
                  <p>{data.catatan}</p>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
