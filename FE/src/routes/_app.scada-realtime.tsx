import { createFileRoute, redirect } from "@tanstack/react-router";

// Dashboard Inscan/OOP dikonsolidasikan menjadi tab "Inscan/OOP" di /scada.
// Rute ini tinggal redirect (link/bookmark lama tetap hidup); filter ?status
// diteruskan agar deep-link kartu RC Inscan/OOP tetap berfungsi.
export const Route = createFileRoute("/_app/scada-realtime")({
  validateSearch: (search: Record<string, unknown>): { status?: "UP" | "DOWN" } =>
    search.status === "UP" || search.status === "DOWN" ? { status: search.status } : {},
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/scada", search: { tab: "inscan", status: search.status } });
  },
});
