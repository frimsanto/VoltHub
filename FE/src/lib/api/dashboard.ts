import apiClient, { ApiResponse, handleResponse } from "./client";

export interface DashboardStats {
  totalToday: number;
  totalReports: number;
  pendingReports: number;
  approvedReports: number;
  rejectedReports: number;
  draftReports: number;
  recentActivities: any[];
  recentReports: Array<{
    id: string;
    reportId: string;
    jenis: string;
    lokasi: string;
    pekerjaan: string;
    status: string;
    createdAt: Date;
  }>;
  trendReports: Array<{
    date: string;
    awal: number;
    akhir: number;
  }>;
  statusDistribution: Array<{
    name: string;
    value: number;
  }>;
  deviceConditions: Array<{
    name: string;
    value: number;
  }>;
  jobStatistics: Array<{
    name: string;
    value: number;
  }>;
}

// Get dashboard statistics
export const getDashboardStats = async (): Promise<DashboardStats> => {
  const response = await apiClient.get<ApiResponse<DashboardStats>>("/dashboard/stats");
  const result = handleResponse(response);
  // Handle both wrapped and unwrapped responses
  const normalizedStats = (result as any)?.data ? (result as any).data : result;
  return normalizedStats as DashboardStats;
};
