import { createFileRoute, Outlet } from "@tanstack/react-router";

// Backward-compatibility namespace. VoltHub used to live under /v2; those routes
// have been promoted to root business URLs. The children here (v2.index, v2.$)
// redirect old links to their new locations.
export const Route = createFileRoute("/v2")({
  component: () => <Outlet />,
});
