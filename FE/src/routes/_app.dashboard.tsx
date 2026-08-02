import { createFileRoute, Navigate } from "@tanstack/react-router";
import { PageHero } from "@/components/PageHero";
import { useV2Role, V2_ROLE_LABELS } from "@/lib/v2/rbac";
import { useAuthStore } from "@/stores/auth";
import { AdminCommandCenter } from "@/features/v2/dashboard/AdminCommandCenter";
import { ManagerCommandCenter } from "@/features/v2/dashboard/ManagerCommandCenter";
import { MasterCommandCenter } from "@/features/v2/dashboard/MasterCommandCenter";
import { PetugasDashboard } from "@/features/v2/dashboard/PetugasDashboard";

export const Route = createFileRoute("/_app/dashboard")({
  component: DashboardPage,
  head: () => ({ meta: [{ title: "Dashboard — VoltHub" }] }),
});

/** Time-of-day greeting (Indonesian) for the header. */
function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 11) return "Selamat pagi";
  if (h < 15) return "Selamat siang";
  if (h < 19) return "Selamat sore";
  return "Selamat malam";
}

// Operational dashboard, role-aware — each role gets a dedicated command center:
//  • MASTER  → governance & system health (users/assets/RTUPP, audit, imports)
//  • MANAGER → decision-maker monitoring (volume/SLA/regional, read-only queue)
//  • ADMIN   → operational hub (validation queue, trends, GIS overview)
//  • PETUGAS → field reporting (today/pending/approved) + quick actions
function DashboardPage() {
  const role = useV2Role();
  const user = useAuthStore((s) => s.user);
  const firstName = user?.name?.split(" ")[0] ?? "Pengguna";

  // NOC has no command center of its own — its home is the Inscan/OOP tab of
  // the consolidated SCADA dashboard, fed by the SP7 snapshot it uploads.
  if (role === "NOC") {
    return <Navigate to="/scada" search={{ tab: "inscan" }} />;
  }

  // PETUGAS owns its identity through the branded gradient hero inside
  // PetugasDashboard, so the page-level greeting hero would only duplicate it
  // ("Selamat pagi" twice). Render the hero for management roles only.
  if (role === "PETUGAS") {
    return (
      <div>
        <PetugasDashboard />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHero
        title={`${greeting()}, ${firstName} 👋`}
        description={`Ringkasan operasional hari ini · ${V2_ROLE_LABELS[role]}${
          user?.rtupp?.name ? ` · ${user.rtupp.name}` : ""
        }`}
        clock
      />
      {/* Each management role gets its own information-first command center
          (real data from the existing dashboard/KPI/report endpoints). */}
      {role === "MASTER" ? (
        <MasterCommandCenter />
      ) : role === "MANAGER" ? (
        <ManagerCommandCenter />
      ) : (
        <AdminCommandCenter />
      )}
    </div>
  );
}
