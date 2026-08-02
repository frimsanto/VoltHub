// VoltHub — GI Status section (konsolidasi Dashboard GI ke /dashboard).
//
// Konten utama bekas halaman /gi-dashboard, dikemas sebagai CollapsibleSection
// di dalam Master/Admin Command Center. Terlihat untuk MASTER, MANAGER global,
// dan user RTUPP1 (mirror gate nav rtupp1Only + guard rute lama). Konten
// di-unmount saat tertutup sehingga query GI baru menembak saat dibuka.
import { Gauge } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthStore } from "@/stores/auth";
import { useV2Role } from "@/lib/v2/rbac";
import { isRtupp1User } from "@/lib/v2/rtupp";
import { GiStatusBadge } from "@/components/v2/GiStatusBadge";
import { CollapsibleSection } from "@/features/v2/dashboard/widgets";
import { useGiDashboard, useGiLeaderboard } from "./resource";

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—";

function Metric({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-[10px] border border-border p-3">
      <p className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Body — hook GI hanya hidup saat section dibuka (di-mount). */
function GiStatusBody({ isGlobal }: { isGlobal: boolean }) {
  const { data, isLoading } = useGiDashboard();
  const leaderboard = useGiLeaderboard(isGlobal, 10);

  if (isLoading || !data) {
    return <Skeleton className="shimmer h-40 w-full" />;
  }

  return (
    <div className="space-y-4">
      {/* Metrik ringkas */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Metric label="Total Inspeksi" value={data.summary.inspeksi.total} />
        <Metric label="Total HAR" value={data.summary.har.total} />
        <Metric label="Menunggu Validasi" value={data.summary.pendingValidation} hint="status SUBMITTED" />
        <Metric label="Tervalidasi" value={data.summary.inspeksi.VALIDATED + data.summary.har.VALIDATED} />
        <Metric label="% Berhasil RC" value={`${data.summary.rcSuccessRate}%`} hint="HAR ter-evaluasi" />
        <Metric label="% Sesuai Master" value={`${data.summary.sesuaiRate}%`} hint="Inspeksi dibanding" />
      </div>

      {/* Per Tim */}
      <div className="overflow-x-auto">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Kinerja per Tim
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-2">Tim</th>
              <th className="py-2 text-right">Inspeksi</th>
              <th className="py-2 text-right">HAR</th>
              <th className="py-2 text-right">Tervalidasi</th>
              <th className="py-2 text-right">Berhasil RC</th>
              <th className="py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.perTeam.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-4 text-center text-muted-foreground">
                  Belum ada data.
                </td>
              </tr>
            ) : (
              data.perTeam.map((t) => (
                <tr key={t.teamId ?? "no-team"} className="border-b border-border/50">
                  <td className="py-2 font-medium">{t.teamName}</td>
                  <td className="py-2 text-right tabular-nums">{t.inspeksi}</td>
                  <td className="py-2 text-right tabular-nums">{t.har}</td>
                  <td className="py-2 text-right tabular-nums">{t.validated}</td>
                  <td className="py-2 text-right tabular-nums">{t.rcSuccess}</td>
                  <td className="py-2 text-right font-semibold tabular-nums">{t.total}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Leaderboard global (MASTER/MANAGER) */}
      {isGlobal && (leaderboard.data ?? []).length > 0 && (
        <div className="overflow-x-auto">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Petugas Terbaik (Global)
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2">#</th>
                <th className="py-2">Petugas</th>
                <th className="py-2">RTUPP</th>
                <th className="py-2">Tim</th>
                <th className="py-2 text-right">Tervalidasi</th>
                <th className="py-2 text-right">% Berhasil RC</th>
                <th className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {(leaderboard.data ?? []).map((p, i) => (
                <tr key={p.petugasId} className="border-b border-border/50">
                  <td className="py-2 tabular-nums">{i + 1}</td>
                  <td className="py-2 font-medium">{p.petugasName}</td>
                  <td className="py-2">{p.rtuppName}</td>
                  <td className="py-2">{p.teamName}</td>
                  <td className="py-2 text-right tabular-nums">{p.validated}</td>
                  <td className="py-2 text-right tabular-nums">{p.rcSuccessRate}%</td>
                  <td className="py-2 text-right tabular-nums">{p.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Terbaru */}
      <div className="overflow-x-auto">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Laporan Terbaru
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-2">Tanggal</th>
              <th className="py-2">Jenis</th>
              <th className="py-2">Gardu</th>
              <th className="py-2">Tim</th>
              <th className="py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.recent.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-4 text-center text-muted-foreground">
                  Belum ada data.
                </td>
              </tr>
            ) : (
              data.recent.map((r) => (
                <tr key={`${r.type}-${r.id}`} className="border-b border-border/50">
                  <td className="py-2">{fmtDate(r.reportDate)}</td>
                  <td className="py-2">
                    <Badge variant="outline">{r.type === "INSPEKSI" ? "Inspeksi" : "HAR"}</Badge>
                  </td>
                  <td className="py-2">{r.gardu}</td>
                  <td className="py-2">{r.team}</td>
                  <td className="py-2">
                    <GiStatusBadge status={r.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Section "GI Status" untuk /dashboard. Merender null bila user tidak berhak
 * (mirror akses rute /gi-dashboard lama: MASTER/MANAGER global + RTUPP1).
 */
export function GiStatusSection() {
  const role = useV2Role();
  const user = useAuthStore((s) => s.user);
  const isGlobal = role === "MASTER" || (role === "MANAGER" && !user?.rtupp);
  const eligible = isGlobal || isRtupp1User(user);
  if (!eligible) return null;

  return (
    <CollapsibleSection title="GI Status (RTUPP1)" icon={Gauge} testId="gi-status-section">
      <GiStatusBody isGlobal={isGlobal} />
    </CollapsibleSection>
  );
}
