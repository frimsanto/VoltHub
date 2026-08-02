import { createFileRoute, redirect } from "@tanstack/react-router";

// KPI Dashboard dikonsolidasikan menjadi section "KPI Dashboard" (collapsible)
// di /dashboard. Rute ini tinggal redirect agar link lama tetap hidup.
export const Route = createFileRoute("/_app/kpi")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
