import apiClient, { ApiResponse, handleResponse } from "./client";

export interface Rtupp {
  id: string;
  code: string;
  name: string;
  region?: string | null;
  address?: string | null;
  phone?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: {
    teams: number;
    users: number;
  };
}

export interface CreateRtuppInput {
  code: string;
  name: string;
  region?: string;
  address?: string;
  phone?: string;
  isActive?: boolean;
}

export interface UpdateRtuppInput {
  code?: string;
  name?: string;
  region?: string;
  address?: string;
  phone?: string;
  isActive?: boolean;
}

// Get all RTUPP
export const getRtupps = async (params?: {
  search?: string;
  isActive?: boolean;
}): Promise<Rtupp[]> => {
  const response = await apiClient.get<ApiResponse<Rtupp[]>>("/rtupp", { params });
  return handleResponse(response);
};

// Create RTUPP
export const createRtupp = async (data: CreateRtuppInput): Promise<Rtupp> => {
  const response = await apiClient.post<ApiResponse<Rtupp>>("/rtupp", data);
  return handleResponse(response);
};

// Update RTUPP
export const updateRtupp = async (id: string, data: UpdateRtuppInput): Promise<Rtupp> => {
  const response = await apiClient.put<ApiResponse<Rtupp>>(`/rtupp/${id}`, data);
  return handleResponse(response);
};

// Delete RTUPP
export const deleteRtupp = async (id: string): Promise<void> => {
  const response = await apiClient.delete<ApiResponse<void>>(`/rtupp/${id}`);
  return handleResponse(response);
};
