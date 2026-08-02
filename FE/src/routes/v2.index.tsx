import { createFileRoute, redirect } from "@tanstack/react-router";

// /v2 → /dashboard (legacy landing).
export const Route = createFileRoute("/v2/")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard", replace: true });
  },
});
