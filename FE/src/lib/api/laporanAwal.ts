import apiClient, { ApiResponse, handleResponse } from "./client";

// Personil Snapshot for audit trail
export interface PersonilSnapshot {
  personilId: string;
  nama: string;
  jabatan?: string;
  rtuppId: string;
  rtuppName: string;
}

export interface LaporanAwal {
  id: string;
  reportId: string;
  hari: string;
  tanggal: string;
  nomorSPJ: string;
  up3: string;
  pekerjaan: string;
  lokasiGardu: string;

  // Team Info
  rtuppId: string;
  teamId: string;
  rtupp?: {
    id: string;
    name: string;
    code: string;
  };
  team?: {
    id: string;
    name: string;
    teamCode: string;
  };

  // Supervisors
  pengawasPekerjaan?: string;
  pengawasManuver?: string;
  pengawasK3?: string;
  nomorWP: string;

  // Personil Snapshot (Audit Trail)
  personilSnapshot: PersonilSnapshot[];
  jumlahPersonil: number;

  // Safety Checklist
  wpJsahirarcSop: boolean;
  kondisiPersonil: "SEHAT" | "KURANG_SEHAT" | "BUTUH_PERHATIAN";
  potensiBahayaDijelaskan: boolean;
  apdLengkap: boolean;
  asuransiKetenagakerjaan: boolean;
  berdoaSebelumBekerja: boolean;

  // Legacy fields (optional)
  pelaksana?: string;
  penanggungJawab?: string;
  potensiBahaya?: string;
  pengendalianRisiko?: string;
  apd?: string;
  rambuKerja?: string;
  asuransiTK?: string;

  status: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "REVISED";
  createdById: string;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  validatedAt?: string;
  createdBy?: {
    id: string;
    name: string;
    email: string;
    rtupp?: {
      id: string;
      name: string;
      code: string;
    };
    team?: {
      id: string;
      name: string;
      code: string;
    };
  };
  attachments?: Attachment[];
  validations?: Validation[];
}

export interface Attachment {
  id: string;
  originalName: string;
  fileName: string;
  mimeType: string;
  size: number;
  path: string;
  category: string;
  uploadedById: string;
  uploadedAt: string;
  previewUrl?: string;
  downloadUrl?: string;
}

export interface Validation {
  id: string;
  status: "APPROVED" | "REJECTED" | "REVISION_REQUESTED";
  notes?: string;
  validatedAt: string;
  validator?: {
    id: string;
    name: string;
  };
}

export interface CreateLaporanAwalInput {
  hari: string;
  tanggal: string;
  nomorSPJ: string;
  up3: string;
  pekerjaan: string;
  lokasiGardu: string;

  // Team Info
  rtuppId: string;
  teamId: string;

  // Supervisors
  pengawasPekerjaan?: string;
  pengawasManuver?: string;
  pengawasK3?: string;
  nomorWP: string;

  // Personil Snapshot (Audit Trail)
  personilSnapshot: PersonilSnapshot[];
  jumlahPersonil?: number;

  // Safety Checklist
  wpJsahirarcSop?: boolean;
  kondisiPersonil?: "SEHAT" | "KURANG_SEHAT" | "BUTUH_PERHATIAN";
  potensiBahayaDijelaskan?: boolean;
  apdLengkap?: boolean;
  asuransiKetenagakerjaan?: boolean;
  berdoaSebelumBekerja?: boolean;

  // Legacy fields (optional)
  pelaksana?: string;
  penanggungJawab?: string;
  potensiBahaya?: string;
  pengendalianRisiko?: string;
  apd?: string;
  rambuKerja?: string;
  asuransiTK?: string;

  status?: "DRAFT" | "PENDING";
}

export interface UpdateLaporanAwalInput extends Partial<CreateLaporanAwalInput> {}

export interface ValidateInput {
  status: "APPROVED" | "REJECTED" | "REVISION_REQUESTED";
  notes?: string;
}

export interface ListParams {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
  startDate?: string;
  endDate?: string;
}

export interface ListResponse {
  data: LaporanAwal[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Create. `config` is optional and used by the offline sync engine to attach an
// idempotency header on replay (backward compatible — normal callers omit it).
export const create = async (
  data: CreateLaporanAwalInput,
  config?: import("axios").AxiosRequestConfig,
): Promise<LaporanAwal> => {
  const response = await apiClient.post<ApiResponse<LaporanAwal>>("/laporan-awal", data, config);
  return handleResponse(response);
};

// Get all
export const getAll = async (params?: ListParams): Promise<ListResponse> => {
  const response = await apiClient.get<ApiResponse<ListResponse>>("/laporan-awal", { params });
  return handleResponse(response);
};

// Get by ID
export const getById = async (id: string): Promise<LaporanAwal> => {
  const response = await apiClient.get<ApiResponse<LaporanAwal>>(`/laporan-awal/${id}`);
  return handleResponse(response);
};

// Update
export const update = async (id: string, data: UpdateLaporanAwalInput): Promise<LaporanAwal> => {
  const response = await apiClient.put<ApiResponse<LaporanAwal>>(`/laporan-awal/${id}`, data);
  return handleResponse(response);
};

// Delete
export const remove = async (id: string): Promise<void> => {
  const response = await apiClient.delete<ApiResponse<void>>(`/laporan-awal/${id}`);
  handleResponse(response);
};

// Validate (admin only)
export const validate = async (id: string, data: ValidateInput): Promise<LaporanAwal> => {
  const response = await apiClient.post<ApiResponse<LaporanAwal>>(
    `/laporan-awal/${id}/validate`,
    data,
  );
  return handleResponse(response);
};
