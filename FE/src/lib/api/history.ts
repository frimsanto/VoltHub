import apiClient, { ApiResponse, handleResponse } from "./client";

export interface HistoryItem {
  id: string;
  reportId: string;
  jenis: "AWAL" | "AKHIR";
  status: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "REVISED";
  createdAt: string;
  updatedAt: string;
  // Laporan Awal fields
  hari?: string;
  tanggal?: string;
  pekerjaan?: string;
  lokasiGardu?: string;
  up3?: string;
  nomorSPJ?: string;
  // Laporan Akhir fields
  tanggalSelesai?: string;
  namaAset?: string;
  // Common
  createdBy?: {
    id: string;
    name: string;
    email: string;
    rtupp?: { id: string; name: string; code: string } | null;
    team?: { id: string; name: string; code: string } | null;
  };
  attachmentCount?: number;
  validations?: Array<{
    id: string;
    status: string;
    notes?: string;
    validatedAt: string;
    validator?: {
      id: string;
      name: string;
    };
  }>;
}

export interface HistoryStats {
  laporanAwal: {
    total: number;
    DRAFT: number;
    PENDING: number;
    APPROVED: number;
    REJECTED: number;
    REVISED: number;
  };
  laporanAkhir: {
    total: number;
    DRAFT: number;
    PENDING: number;
    APPROVED: number;
    REJECTED: number;
    REVISED: number;
  };
  total: number;
}

export interface HistoryParams {
  jenis?: "ALL" | "AWAL" | "AKHIR";
  status?: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "REVISED";
  search?: string;
  page?: number;
  limit?: number;
  startDate?: string;
  endDate?: string;
  createdBy?: string;
}

export interface HistoryResponse {
  items: HistoryItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Get unified history
export const getHistory = async (params?: HistoryParams): Promise<HistoryResponse> => {
  const response = await apiClient.get<ApiResponse<HistoryResponse>>("/history", { params });
  const result = handleResponse(response);

  // Handle both old and new response formats for backward compatibility
  if (result && typeof result === "object") {
    // New format: { items: [], pagination: {} }
    if ("items" in result && "pagination" in result) {
      return result as HistoryResponse;
    }
    // Old format: { data: [], meta: {} }
    if ("data" in result && "meta" in result) {
      const oldResult = result as any;
      return {
        items: Array.isArray(oldResult.data) ? oldResult.data : [],
        pagination: oldResult.meta || { page: 1, limit: 10, total: 0, totalPages: 1 },
      };
    }
    // Direct array format
    if (Array.isArray(result)) {
      const arrayResult = result as any[];
      return {
        items: arrayResult,
        pagination: { page: 1, limit: 10, total: arrayResult.length, totalPages: 1 },
      };
    }
  }

  // Fallback
  return {
    items: [],
    pagination: { page: 1, limit: 10, total: 0, totalPages: 1 },
  };
};

// Get history statistics
export const getHistoryStats = async (): Promise<HistoryStats> => {
  const response = await apiClient.get<ApiResponse<HistoryStats>>("/history/stats");
  return handleResponse(response);
};
