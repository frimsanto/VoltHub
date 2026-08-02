import { redirect } from "@tanstack/react-router";

import { useAuthStore, type Role } from "@/stores/auth";

function getRole(): Role | null {
  return useAuthStore.getState().user?.role ?? null;
}

export function requireAuth() {
  const isAuthed = useAuthStore.getState().isAuthed;
  if (!isAuthed) {
    throw redirect({ to: "/login" });
  }
}

export function requireRole(allowed: Role[]) {
  requireAuth();
  const role = getRole();
  if (!role || !allowed.includes(role)) {
    throw redirect({ to: "/dashboard" });
  }
}
