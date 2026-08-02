// VoltHub — Floating AI Assistant (FAB).
// The professional placement pattern (Intercom / Copilot style): a button
// pinned to the bottom-right of every page that opens the premium ChatDrawer
// (features/v2/ai-assistant). Role-gated to OPS roles (MASTER/MANAGER/ADMIN) —
// the same audience as the full-page /ai-search route. PETUGAS does not see it.

import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { ChatDrawer } from "@/features/v2/ai-assistant/ChatDrawer";
import { useV2Role, hasRole } from "@/lib/v2/rbac";
import { OPS_ROLES } from "@/lib/v2/route-guards";

export function AssistantFab() {
  const role = useV2Role();
  const [open, setOpen] = useState(false);

  // Close on Escape for keyboard users.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!hasRole(role, OPS_ROLES)) return null;

  return (
    <>
      <ChatDrawer open={open} onClose={() => setOpen(false)} />

      {/* Trigger button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-[calc(var(--bottomnav-h)+1rem)] right-4 z-40 flex size-12 cursor-pointer items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/30 transition-all duration-200 hover:scale-105 hover:shadow-primary/50 active:scale-95 md:bottom-6 md:right-6"
        aria-label={open ? "Tutup VoltHub AI" : "Buka VoltHub AI"}
        aria-expanded={open}
      >
        {/* Animated ring — a quiet pulse while the drawer is closed. */}
        {!open && (
          <span
            className="absolute inset-0 animate-ping rounded-2xl bg-primary/20 animation-duration-[3s]"
            aria-hidden
          />
        )}
        {open ? (
          <X className="relative size-5 text-primary-foreground" />
        ) : (
          <Sparkles className="relative size-5 text-primary-foreground" />
        )}
      </button>
    </>
  );
}
