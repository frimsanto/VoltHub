import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy /v2/* → promoted business routes (Locations→Gardu, Feeders→Penyulang…).
const SEGMENT: Record<string, string> = {
  locations: "gardu",
  assets: "asset",
  inspections: "inspection",
  feeders: "penyulang",
  "communication-media": "communication-media",
  documents: "documents",
  reports: "reports",
  imports: "imports",
  "ai-search": "ai-search",
  tickets: "tickets",
  har: "har",
  users: "users",
  rtupp: "rtupp",
  teams: "teams",
};

export const Route = createFileRoute("/v2/$")({
  beforeLoad: ({ params }) => {
    const splat = (params as { _splat?: string })._splat ?? "";
    const [head, ...rest] = splat.split("/");
    const mapped = SEGMENT[head] ?? "dashboard";
    const to = "/" + [mapped, ...rest].filter(Boolean).join("/");
    throw redirect({ to: to as never, replace: true });
  },
});
