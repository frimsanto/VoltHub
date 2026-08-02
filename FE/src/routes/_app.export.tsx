import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/common";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { FileSpreadsheet, FileArchive, Loader2 } from "lucide-react";
import { useState } from "react";
import { showSuccess, showError } from "@/lib/swal";
import { requireRole } from "@/lib/route-guards";
import { exportXlsx, exportZip, downloadBlob } from "@/lib/api/export";
import { useReports } from "@/features/report";

export const Route = createFileRoute("/_app/export")({
  beforeLoad: () => {
    requireRole(["admin", "superadmin"]);
  },
  component: ExportPage,
  head: () => ({ meta: [{ title: "Export Data — VoltHub" }] }),
});

type JenisFilter = "ALL" | "AWAL" | "AKHIR";

// Map jenis laporan (UPPERCASE dari history API) ke segmen path endpoint ZIP.
const ZIP_JENIS: Record<string, "awal" | "akhir"> = {
  AWAL: "awal",
  AKHIR: "akhir",
};

function ExportPage() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [jenis, setJenis] = useState<JenisFilter>("ALL");
  const [selectedReportId, setSelectedReportId] = useState("");
  const [zipLoading, setZipLoading] = useState(false);
  const [xlsLoading, setXlsLoading] = useState(false);

  // Daftar laporan sesuai filter aktif: dipakai untuk hitung total & pilihan ZIP.
  const { data: reports, isLoading: reportsLoading } = useReports({
    jenis,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    page: 1,
    limit: 100,
  });

  const items = reports?.items ?? [];
  const total = reports?.pagination?.total ?? 0;

  async function runXls() {
    setXlsLoading(true);
    try {
      const blob = await exportXlsx({
        jenis,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      const stamp = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `VoltHub_History_${stamp}.xlsx`);
      showSuccess("XLSX berhasil diunduh");
    } catch {
      showError("Gagal mengunduh XLSX", "Periksa koneksi atau coba lagi.");
    } finally {
      setXlsLoading(false);
    }
  }

  async function runZip() {
    const report = items.find((r) => r.id === selectedReportId);
    if (!report) {
      showError("Pilih laporan", "Pilih satu laporan untuk diekspor sebagai ZIP.");
      return;
    }
    const zipJenis = ZIP_JENIS[report.jenis];
    if (!zipJenis) {
      showError("Jenis laporan tidak didukung");
      return;
    }
    setZipLoading(true);
    try {
      const blob = await exportZip(zipJenis, report.id);
      downloadBlob(blob, `${report.reportId}.zip`);
      showSuccess("ZIP Evidence berhasil diunduh", `Evidence untuk laporan ${report.reportId}`);
    } catch {
      showError("Gagal mengunduh ZIP", "Periksa koneksi atau coba lagi.");
    } finally {
      setZipLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Export Data" description="Unduh evidence dan histori laporan." />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-2 rounded-2xl shadow-soft border-border/60">
          <CardHeader>
            <CardTitle className="text-base">Filter Export</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Periode dari</Label>
              <Input
                type="date"
                className="rounded-xl"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Periode sampai</Label>
              <Input
                type="date"
                className="rounded-xl"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs">Jenis Laporan</Label>
              <Select
                value={jenis}
                onValueChange={(v) => {
                  setJenis(v as JenisFilter);
                  setSelectedReportId("");
                }}
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua</SelectItem>
                  <SelectItem value="AWAL">Laporan Awal</SelectItem>
                  <SelectItem value="AKHIR">Laporan Akhir</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl shadow-soft border-border/60 gradient-pln-soft">
          <CardContent className="p-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Total terpilih
            </div>
            <div className="text-4xl font-bold mt-1 tabular-nums">
              {reportsLoading ? "…" : total}
            </div>
            <div className="text-xs text-muted-foreground mt-2">laporan</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="rounded-2xl shadow-soft border-border/60">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileArchive className="size-4 text-pln-blue" /> Export ZIP Evidence
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Mengkompresi foto, dokumen, dan SLD dari satu laporan menjadi 1 file ZIP.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">Pilih laporan</Label>
              <Select
                value={selectedReportId}
                onValueChange={setSelectedReportId}
                disabled={reportsLoading || items.length === 0}
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue
                    placeholder={
                      reportsLoading
                        ? "Memuat laporan…"
                        : items.length === 0
                          ? "Tidak ada laporan"
                          : "Pilih laporan"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {items.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.reportId} — {r.jenis}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full rounded-xl gradient-pln text-white"
              onClick={runZip}
              disabled={zipLoading || !selectedReportId}
            >
              {zipLoading ? (
                <Loader2 className="size-4 mr-2 animate-spin" />
              ) : (
                <FileArchive className="size-4 mr-2" />
              )}
              {zipLoading ? "Menyiapkan ZIP…" : "Unduh ZIP Evidence"}
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-soft border-border/60">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileSpreadsheet className="size-4 text-success" /> Export XLSX History
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Tabel histori lengkap dengan filter aktif dalam format Excel.
            </p>
            <p className="text-xs text-muted-foreground">
              {reportsLoading
                ? "Menghitung laporan…"
                : `${total} laporan akan diekspor sesuai filter.`}
            </p>
            <Button
              className="w-full rounded-xl"
              variant="outline"
              onClick={runXls}
              disabled={xlsLoading}
            >
              {xlsLoading ? (
                <Loader2 className="size-4 mr-2 animate-spin" />
              ) : (
                <FileSpreadsheet className="size-4 mr-2" />
              )}
              {xlsLoading ? "Menyiapkan XLSX…" : "Unduh XLSX History"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
