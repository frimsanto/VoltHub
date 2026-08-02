import { createFileRoute } from "@tanstack/react-router";
import { requireV2Auth } from "@/lib/v2/route-guards";
import { PageHero } from "@/components/PageHero";
import { useV2Role } from "@/lib/v2/rbac";
import { Network } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScadaOverview } from "@/features/v2/dashboard/OverviewKpis";
import { CollapsibleSection } from "@/features/v2/dashboard/widgets";
import { ScadaRtuDashboard } from "@/features/v2/scada-snapshot/ScadaRtuDashboard";
import { ScadaLinesDashboard } from "@/features/v2/scada-snapshot/ScadaLinesDashboard";
import { ScadaRealtimeDashboard } from "@/features/v2/scada-realtime/ScadaRealtimeDashboard";
import { usePerformanceDashboard } from "@/features/v2/performance/resource";

// Dashboard SCADA terkonsolidasi — tiga tab dalam satu halaman:
//   • Overview    — registry jaringan (Gardu/Penyulang/Asset) + availability.
//   • Inscan/OOP  — status RTU dari snapshot SP7 (scada_rtu_rows; sumber angka
//                   RC yang benar) + breakdown GH/GI registry sebagai sekunder.
//   • SCADA Lines — status channel/koneksi IFS per server dari snapshot SP7.
// Guard longgar (auth saja) karena tab Inscan/OOP historis terbuka untuk semua
// role (bekas /scada-realtime); tab Overview/Lines disembunyikan per role.
type ScadaTab = "overview" | "inscan" | "lines";

export const Route = createFileRoute("/_app/scada")({
  beforeLoad: () => requireV2Auth(),
  // ?tab= pilih tab aktif; ?status=UP|DOWN filter awal tabel RTU (dipakai link
  // kartu RC Inscan/OOP). Nilai lain diabaikan.
  validateSearch: (
    search: Record<string, unknown>,
  ): { tab?: ScadaTab; status?: "UP" | "DOWN" } => ({
    ...(search.tab === "overview" || search.tab === "inscan" || search.tab === "lines"
      ? { tab: search.tab as ScadaTab }
      : {}),
    ...(search.status === "UP" || search.status === "DOWN" ? { status: search.status } : {}),
  }),
  component: ScadaDashboardPage,
  head: () => ({ meta: [{ title: "Dashboard SCADA — VoltHub" }] }),
});

/** Hero dengan stat AVA — dipisah agar query performance hanya jalan untuk
 *  role monitoring (endpoint-nya OPS-gated; NOC/PETUGAS tidak perlu menembak). */
function HeroWithAva() {
  const perf = usePerformanceDashboard();
  return (
    <PageHero
      title="Dashboard SCADA"
      description="Monitoring jaringan: registry Gardu/Penyulang, status RC dari snapshot SP7, dan SCADA Lines."
      statLabel="AVA Rata-rata"
      statValue={perf.avgAvailability != null ? `${perf.avgAvailability}%` : undefined}
      clock
    />
  );
}

function ScadaDashboardPage() {
  const role = useV2Role();
  const { tab, status } = Route.useSearch();
  const navigate = Route.useNavigate();

  const canOverview = role === "MASTER" || role === "MANAGER" || role === "ADMIN";
  const canLines = canOverview || role === "NOC";

  // Default: Overview untuk role monitoring, Inscan/OOP untuk NOC (dan PETUGAS,
  // yang memang tidak punya akses Overview).
  const fallback: ScadaTab = canOverview ? "overview" : "inscan";
  let active: ScadaTab = tab ?? fallback;
  if ((active === "overview" && !canOverview) || (active === "lines" && !canLines)) {
    active = "inscan";
  }

  const setTab = (t: ScadaTab) =>
    navigate({
      search: { tab: t, status: t === "inscan" ? status : undefined },
      replace: true,
    });

  return (
    <div className="space-y-6">
      {canOverview ? (
        <HeroWithAva />
      ) : (
        <PageHero
          title="Dashboard SCADA"
          description="Status RC Gardu (IN-SCAN vs OOP) dan SCADA Lines dari snapshot Siemens SP7."
          clock
        />
      )}

      <Tabs value={active} onValueChange={(v) => setTab(v as ScadaTab)}>
        <TabsList>
          {canOverview && <TabsTrigger value="overview">Overview</TabsTrigger>}
          <TabsTrigger value="inscan">Inscan/OOP</TabsTrigger>
          {canLines && <TabsTrigger value="lines">SCADA Lines</TabsTrigger>}
        </TabsList>
      </Tabs>

      {/* key=active agar animasi fade 150ms replay tiap ganti tab. */}
      <div key={active} className="tab-fade space-y-6">
        {active === "overview" && <ScadaOverview />}
        {active === "inscan" && (
          <>
            <ScadaRtuDashboard initialFilter={status} />
            {/* Breakdown sekunder dari registry workbook (bukan sumber angka RC). */}
            <CollapsibleSection
              title="Breakdown GH/GI per RTUPP (registry workbook)"
              icon={Network}
            >
              <ScadaRealtimeDashboard />
            </CollapsibleSection>
          </>
        )}
        {active === "lines" && <ScadaLinesDashboard />}
      </div>
    </div>
  );
}
