// VoltHub — Recent activity + reporting stats from the existing V1 dashboard
// endpoint (GET /api/dashboard/stats). Reused by the SUPERADMIN "Recent Activity"
// panel and the PETUGAS dashboard (laporan today/pending/approved + trend).
import { useQuery } from "@tanstack/react-query";
import { getDashboardStats } from "@/lib/api/dashboard";

export interface ActivityItem {
  user: string;
  action: string;
  entity: string;
  time: string;
}

export function useDashboardStatsRaw() {
  return useQuery({ queryKey: ["dashboard", "stats"], queryFn: getDashboardStats });
}

export function useDashboardActivity() {
  const q = useDashboardStatsRaw();
  const items: ActivityItem[] = (q.data?.recentActivities ?? []).slice(0, 8).map((a: any) => ({
    user: a.user?.name ?? "User",
    action: a.action ?? "melakukan aktivitas",
    entity: a.entityType ?? "Laporan",
    time: a.createdAt ? new Date(a.createdAt).toLocaleString("id-ID") : "-",
  }));
  return { items, isLoading: q.isLoading };
}
