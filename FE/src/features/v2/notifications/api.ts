// VoltHub — Notification Center (server-backed).
//
// Backend (BE/src/modules/notifications): the authenticated user's own inbox.
//   GET  /v1/notifications?page&limit&unreadOnly   → list + meta.unread
//   GET  /v1/notifications/unread-count            → { unread }
//   POST /v1/notifications/:id/read                → { updated }
//   POST /v1/notifications/read-all                → { updated }
//
// In-app rows are created synchronously by trigger events (task assigned, report
// submitted/approved/rejected, revision requested, ticket created/closed); push
// delivery is handled separately by the backend retry queue. The FE simply polls
// the unread counter for the bell badge and fetches the list for the drawer.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import apiClient, { type ApiResponse } from "@/lib/api/client";

export const NOTIFICATION_TYPES = [
  "TASK_ASSIGNED",
  "REPORT_SUBMITTED",
  "REPORT_APPROVED",
  "REPORT_REJECTED",
  "REVISION_REQUESTED",
  "TICKET_CREATED",
  "TICKET_CLOSED",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  entityType?: string | null;
  entityId?: string | null;
  data?: Record<string, unknown> | null;
  readAt?: string | null;
  createdAt: string;
}

export interface NotificationListResult {
  items: AppNotification[];
  unread: number;
  total: number;
  page: number;
  totalPages: number;
}

const BASE = "/v1/notifications";

export const notificationKeys = {
  all: ["notifications"] as const,
  list: (unreadOnly: boolean) => ["notifications", "list", { unreadOnly }] as const,
  unread: ["notifications", "unread-count"] as const,
};

export async function fetchNotifications(params: {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
}): Promise<NotificationListResult> {
  const res = await apiClient.get<ApiResponse<AppNotification[]>>(BASE, { params });
  const meta = (res.data.meta ?? {}) as {
    unread?: number;
    total?: number;
    page?: number;
    totalPages?: number;
  };
  return {
    items: res.data.data ?? [],
    unread: meta.unread ?? 0,
    total: meta.total ?? 0,
    page: meta.page ?? 1,
    totalPages: meta.totalPages ?? 0,
  };
}

export async function fetchUnreadCount(): Promise<number> {
  const res = await apiClient.get<ApiResponse<{ unread: number }>>(`${BASE}/unread-count`);
  return res.data.data?.unread ?? 0;
}

export async function markNotificationRead(id: string): Promise<void> {
  await apiClient.post(`${BASE}/${id}/read`);
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiClient.post(`${BASE}/read-all`);
}

// ── React Query hooks ────────────────────────────────────────────────────────

/** Poll the unread counter for the bell badge (default every 30s). */
export function useUnreadCount(options?: { enabled?: boolean; refetchInterval?: number }) {
  return useQuery({
    queryKey: notificationKeys.unread,
    queryFn: fetchUnreadCount,
    refetchInterval: options?.refetchInterval ?? 30_000,
    refetchOnWindowFocus: true,
    enabled: options?.enabled ?? true,
  });
}

/** Fetch the notification feed for the drawer / center. */
export function useNotifications(params: {
  unreadOnly?: boolean;
  limit?: number;
  enabled?: boolean;
}) {
  const unreadOnly = params.unreadOnly ?? false;
  return useQuery({
    queryKey: notificationKeys.list(unreadOnly),
    queryFn: () => fetchNotifications({ unreadOnly, limit: params.limit ?? 30 }),
    enabled: params.enabled ?? true,
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}
