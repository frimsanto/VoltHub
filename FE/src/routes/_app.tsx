import { createFileRoute, Outlet, Navigate, useRouterState } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useAuthStore } from "@/stores/auth";
import { AppShell } from "@/components/v2/V2AppLayout";
import { requireAuth } from "@/lib/route-guards";
import { initPush } from "@/lib/native/push";

export const Route = createFileRoute("/_app")({
  beforeLoad: () => {
    requireAuth();
  },
  component: AppLayout,
});

function AppLayout() {
  const isAuthed = useAuthStore((s) => s.isAuthed);
  const mustChangePassword = useAuthStore((s) => s.user?.mustChangePassword);

  // Register for push notifications once authenticated (native only; no-op web).
  useEffect(() => {
    if (isAuthed) void initPush();
  }, [isAuthed]);

  if (!isAuthed) return <Navigate to="/login" />;
  // First-login users must change their temporary password before accessing
  // any application route — no bypass.
  if (mustChangePassword) return <Navigate to="/change-password" />;
  // Single VoltHub application shell (sidebar + topbar) for every route.
  return (
    <AppShell>
      <RouteTransition>
        <Outlet />
      </RouteTransition>
    </AppShell>
  );
}

/**
 * Subtle fade/slide-up on navigation. Keying the wrapper on the pathname remounts
 * it per route, replaying the `fade-in` keyframe (disabled under reduced-motion
 * via animations.css). Keeps transitions cheap — no animation library.
 */
function RouteTransition({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div key={pathname} className="fade-in">
      {children}
    </div>
  );
}
