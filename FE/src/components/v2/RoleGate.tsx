// VoltHub V2 — RoleGate
// Declarative show/hide for UI driven by the V2 RBAC matrix (mirrors backend).
// Use `roles` for explicit role lists, or `capability` for semantic actions
// (preferred — keeps call sites aligned with the contract). When neither matches
// the current user, renders `fallback` (default: nothing).
//
//   <RoleGate capability="locations.write"><Button>+ Create</Button></RoleGate>
//   <RoleGate roles={["SUPERADMIN"]}><DangerZone /></RoleGate>

import type { ReactNode } from "react";
import { useV2Role, hasRole, can, type V2Role, type V2Capability } from "@/lib/v2/rbac";

export function RoleGate({
  roles,
  capability,
  fallback = null,
  children,
}: {
  roles?: readonly V2Role[];
  capability?: V2Capability;
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const role = useV2Role();
  const allowed = capability ? can(role, capability) : hasRole(role, roles);
  return <>{allowed ? children : fallback}</>;
}
