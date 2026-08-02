import { createFileRoute, redirect } from "@tanstack/react-router";

// SCADA Lines dikonsolidasikan menjadi tab "SCADA Lines" di /scada.
// Rute ini tinggal redirect agar link/bookmark lama tetap hidup.
export const Route = createFileRoute("/_app/scada-lines")({
  beforeLoad: () => {
    throw redirect({ to: "/scada", search: { tab: "lines" } });
  },
});
