import { useQuery } from "@tanstack/react-query";
import { getDashboardStats, type DashboardStats } from "@/lib/api/dashboard";
import { getHistoryStats, type HistoryStats } from "@/lib/api/history";

/**
 * Hook bersama Executive Dashboard.
 * - stats   : agregat utama (totals, status, trend 14 hari, recent, jobStatistics) — GET /dashboard/stats
 * - byJenis : total per jenis laporan (Awal/Akhir)                                 — GET /history/stats
 * Tidak mengubah kontrak API; hanya mengkonsumsi endpoint yang sudah ada.
 */
export function useDashboard() {
  const stats = useQuery<DashboardStats>({
    queryKey: ["dashboard", "stats"],
    queryFn: getDashboardStats,
  });

  const byJenis = useQuery<HistoryStats>({
    queryKey: ["dashboard", "byJenis"],
    queryFn: getHistoryStats,
  });

  return { stats, byJenis };
}
