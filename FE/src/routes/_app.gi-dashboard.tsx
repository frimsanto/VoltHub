import { createFileRoute, redirect } from "@tanstack/react-router";

// Dashboard GI dikonsolidasikan menjadi section "GI Status" (collapsible) di
// /dashboard untuk user RTUPP1 / MASTER / MANAGER global. Rute ini tinggal
// redirect agar link lama tetap hidup.
export const Route = createFileRoute("/_app/gi-dashboard")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
