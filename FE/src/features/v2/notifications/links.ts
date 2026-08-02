// VoltHub — notification → in-app route resolver.
//
// Single source of truth for "where does tapping this notification go?", shared
// by the web Notification Center (drawer click) and the native push deep-link
// handler (lib/native/push.ts). Tolerant of however the triggering module
// labelled `entityType` (the workflow is generic), falling back to the event
// `type` and finally a safe landing page.

import type { AppNotification, NotificationType } from "./api";

const reportPath = (entityType: string | null | undefined, id: string): string => {
  const t = (entityType ?? "").toLowerCase();
  if (t.includes("akhir")) return `/laporan-akhir/${id}`;
  if (t.includes("awal")) return `/laporan-awal/${id}`;
  // Unknown report flavour → History is the safe, role-agnostic landing page.
  return `/history`;
};

const TYPE_FALLBACK: Record<NotificationType, (id: string) => string> = {
  TASK_ASSIGNED: (id) => `/tickets/${id}`,
  TICKET_CREATED: (id) => `/tickets/${id}`,
  TICKET_CLOSED: (id) => `/tickets/${id}`,
  REPORT_SUBMITTED: () => `/history`,
  REPORT_APPROVED: () => `/history`,
  REPORT_REJECTED: () => `/history`,
  REVISION_REQUESTED: () => `/history`,
};

/** Resolve a notification to an in-app path, or null when not linkable. */
export function resolveNotificationLink(
  n: Pick<AppNotification, "type" | "entityType" | "entityId" | "data">,
): string | null {
  const id =
    n.entityId ?? ((n.data?.entityId as string | undefined) || (n.data?.id as string | undefined));
  if (!id) return null;

  const entityType = n.entityType ?? (n.data?.entityType as string | undefined);
  const typeLower = (entityType ?? "").toLowerCase();
  if (typeLower === "workorder" || typeLower === "work-order") return `/work-order/${id}`;

  if (typeLower === "ticket") return `/tickets/${id}`;
  if (n.type.startsWith("TICKET") || n.type === "TASK_ASSIGNED") return `/tickets/${id}`;
  if (n.type.startsWith("REPORT") || n.type === "REVISION_REQUESTED") {
    return reportPath(entityType, id);
  }
  return TYPE_FALLBACK[n.type]?.(id) ?? null;
}
