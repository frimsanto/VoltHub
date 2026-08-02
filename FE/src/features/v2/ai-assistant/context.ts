// VoltHub — AI Assistant: Context Resolver (architecture only).
//
// Resolves the *real, already-loaded* app context the prompt builder needs to
// ground an answer in WHO is asking and WHAT scope they may see. It reads from
// the auth store only — no fetching, no network, no SDK. This is the single
// place that decides "what does the assistant know about the current session",
// so the future LLM backend can be handed a faithful, least-privilege context.
import { useMemo } from "react";
import { useAuthStore } from "@/stores/auth";
import { toV2Role, V2_ROLE_LABELS, type V2Role } from "@/lib/v2/rbac";
import type { AssistantContext } from "./types";

/** Resolve assistant context from the current session (no side effects). */
export function resolveContext(
  user: { name?: string; role?: string; rtupp?: { name?: string } | null } | null | undefined,
): AssistantContext {
  if (!user) return { locale: "id" };
  const role = toV2Role(user.role);
  return {
    userName: user.name,
    role,
    rtuppName: user.rtupp?.name ?? null,
    locale: "id",
  };
}

/**
 * Data scope the assistant is allowed to answer over, derived from role.
 * MASTER/MANAGER/ADMIN see org-wide data; a future PETUGAS assistant would be
 * scoped to its own RTUPP. Kept here so the service layer never has to re-derive
 * authorization — it always honours what the backend already enforces.
 */
export function resolveScope(
  role: V2Role | undefined,
  rtuppName: string | null | undefined,
): {
  level: "global" | "rtupp";
  label: string;
} {
  if (role === "PETUGAS") {
    return { level: "rtupp", label: rtuppName ?? "RTUPP Anda" };
  }
  return { level: "global", label: "seluruh jaringan" };
}

/** React hook: live assistant context bound to the auth store. */
export function useAssistantContext(): AssistantContext {
  const user = useAuthStore((s) => s.user);
  return useMemo(() => resolveContext(user), [user]);
}

/** Human-readable one-liner describing the current session (for the prompt). */
export function describeContext(ctx: AssistantContext): string {
  const role = ctx.role ? (V2_ROLE_LABELS[ctx.role as V2Role] ?? ctx.role) : "Pengguna";
  const who = ctx.userName ? `${ctx.userName} (${role})` : role;
  const scope = ctx.rtuppName ? ` · unit ${ctx.rtuppName}` : "";
  return `${who}${scope}`;
}
