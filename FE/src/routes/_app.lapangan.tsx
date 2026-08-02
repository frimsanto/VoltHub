import { createFileRoute } from "@tanstack/react-router";
import { requireV2Auth } from "@/lib/v2/route-guards";
import { PageHero } from "@/components/PageHero";
import { useV2Role } from "@/lib/v2/rbac";
import { LapanganDashboard } from "@/features/v2/dashboard/LapanganDashboard";
import { PetugasDashboard } from "@/features/v2/dashboard/PetugasDashboard";

// Dashboard Tim Lapangan (operational domain) — fokus ke aktivitas berjalan:
// WO aktif, laporan pending approval, tren 14 hari, dan leaderboard tim.
// Duplikasi AdminDashboard lama dihapus — AdminCommandCenter di /dashboard
// sudah meng-handle sisanya. PETUGAS tetap mendapat home task-first sendiri.
export const Route = createFileRoute("/_app/lapangan")({
  beforeLoad: () => requireV2Auth(),
  component: FieldDashboardPage,
  head: () => ({ meta: [{ title: "Dashboard Lapangan — VoltHub" }] }),
});

function FieldDashboardPage() {
  const role = useV2Role();

  // PETUGAS gets a self-contained, task-first home: its own greeting hero
  // (PageHero gradient di dalam PetugasDashboard) is the page identity, so we
  // drop the generic "Dashboard Lapangan" hero to avoid a duplicate title.
  if (role === "PETUGAS") {
    return <PetugasDashboard />;
  }

  return (
    <div className="space-y-6">
      <PageHero
        title="Dashboard Lapangan"
        description="Aktivitas operasional tim lapangan: Work Order aktif, laporan pending, dan tren."
        clock
      />
      <LapanganDashboard />
    </div>
  );
}
