import apiClient, { ApiResponse, handleResponse } from "./client";

export interface Personil {
  id: string;
  nip: string;
  nama: string;
  jabatan: string;
  rtuppId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  rtupp?: {
    id: string;
    code: string;
    name: string;
  };
}

export interface CreatePersonilInput {
  nip: string;
  nama: string;
  jabatan: string;
  rtuppId: string;
  isActive?: boolean;
}

export interface UpdatePersonilInput {
  nip?: string;
  nama?: string;
  jabatan?: string;
  rtuppId?: string;
  isActive?: boolean;
}

// Get all Personil (filterable by rtuppId / active / search)
export const getPersonil = async (params?: {
  search?: string;
  rtuppId?: string;
  isActive?: boolean;
}): Promise<Personil[]> => {
  const response = await apiClient.get<ApiResponse<Personil[]>>("/personil", { params });
  return handleResponse(response);
};

// Get single Personil
export const getPersonilById = async (id: string): Promise<Personil> => {
  const response = await apiClient.get<ApiResponse<Personil>>(`/personil/${id}`);
  return handleResponse(response);
};

// Create Personil
export const createPersonil = async (data: CreatePersonilInput): Promise<Personil> => {
  const response = await apiClient.post<ApiResponse<Personil>>("/personil", data);
  return handleResponse(response);
};

// Update Personil
export const updatePersonil = async (id: string, data: UpdatePersonilInput): Promise<Personil> => {
  const response = await apiClient.put<ApiResponse<Personil>>(`/personil/${id}`, data);
  return handleResponse(response);
};

// Delete Personil
export const deletePersonil = async (id: string): Promise<void> => {
  const response = await apiClient.delete<ApiResponse<void>>(`/personil/${id}`);
  return handleResponse(response);
};
