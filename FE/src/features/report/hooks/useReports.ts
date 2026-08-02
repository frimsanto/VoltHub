import { useQuery } from "@tanstack/react-query";
import { getHistory, type HistoryParams, type HistoryResponse } from "@/lib/api/history";

/**
 * Root cache key untuk seluruh daftar laporan (Monitoring / History / Validasi).
 * Invalidasi `['reports']` akan me-refresh semua varian params.
 */
export const REPORTS_QUERY_KEY = "reports" as const;

/**
 * Hook bersama untuk mengambil daftar laporan via `getHistory`.
 * Cache key: ['reports', params].
 *
 * Catatan perilaku: tanpa `placeholderData`, setiap kombinasi params adalah key baru
 * sehingga `isLoading` true saat params berubah — identik dengan perilaku spinner
 * pada implementasi useState/useEffect sebelumnya.
 */
export function useReports(params: HistoryParams = {}, options?: { enabled?: boolean }) {
  return useQuery<HistoryResponse>({
    queryKey: [REPORTS_QUERY_KEY, params],
    queryFn: () => getHistory(params),
    enabled: options?.enabled,
  });
}
