import apiClient, { ApiResponse, handleResponse } from "./client";

export interface LaporanAkhir {
  id: string;
  reportId: string;
  laporanAwalId?: string;

  // Basic Info
  tanggalSelesai: string;
  jenisPekerjaan: string;

  // Location Info
  up3: string;
  rtupp?: string;
  gardu: string;

  // Technical Info
  asdu?: string;
  ipModem?: string;
  ipRTU?: string;
  ipSIM1?: string;
  ipSIM2?: string;
  ipGTWIconPlus?: string;
  ipWAN?: string;

  // Aset SCADA - Split into Nama and Type
  rtuNama: string;
  rtuType: string;
  mediaNama: string;
  mediaType: string;
  rectifierNama: string;
  rectifierType: string;
  bateraiNama: string;
  bateraiType: string;

  // Pekerjaan Detail
  langkahPekerjaan: string;
  hasilPekerjaan: string;

  // Catatan Perangkat - Enums
  catatanRTU: "NORMAL" | "RUSAK";
  catatanMedia: "NORMAL" | "RUSAK";
  catatanRectifier: "NORMAL" | "RUSAK";
  catatanBaterai: "NORMAL" | "HATI_HATI" | "RUSAK";
  catatanLain?: string;

  // Status - Enums
  statusSebelum: "APPDISK" | "GAGAL_RC" | "OOP" | "INSCAN" | "BERHASIL_RC" | "LAIN_LAIN";
  statusSesudah: "APPDISK" | "GAGAL_RC" | "OOP" | "INSCAN" | "BERHASIL_RC" | "LAIN_LAIN";
  statusPekerjaan: "SELESAI" | "PARSIAL" | "GAGAL";

  // Penutup
  pengawas: string;
  pelaksana: string;

  // Legacy fields (for compatibility)
  nomorSPJ?: string;
  pekerjaan?: string;
  namaAset?: string;
  tagSCADA?: string;
  bayPosisi?: string;
  teganganNominal?: string;
  detailLangkah?: string;
  hasilTahananIsolasi?: string;
  hasilPengukuranBeban?: string;
  catatanHasil?: string;
  durasiPekerjaan?: string;
  catatanTambahan?: string;

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
  };
  attachments?: Array<{
    id: string;
    originalName: string;
    category: string;
    // Returned by getById (Prisma `attachments: true`) — present at runtime.
    mimeType?: string;
    fileName?: string;
    size?: number;
  }>;
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

export interface CreateLaporanAkhirInput {
  // Basic Info
  laporanAwalId?: string;
  tanggalSelesai: string;
  jenisPekerjaan: string;

  // Location Info
  up3: string;
  rtupp?: string;
  gardu: string;

  // Technical Info
  asdu?: string;
  ipModem?: string;
  ipRTU?: string;
  ipSIM1?: string;
  ipSIM2?: string;
  ipGTWIconPlus?: string;
  ipWAN?: string;

  // Aset SCADA - Split into Nama and Type
  rtuNama: string;
  rtuType: string;
  mediaNama: string;
  mediaType: string;
  rectifierNama: string;
  rectifierType: string;
  bateraiNama: string;
  bateraiType: string;

  // Pekerjaan Detail
  langkahPekerjaan: string;
  hasilPekerjaan: string;

  // Catatan Perangkat - Enums
  catatanRTU?: "NORMAL" | "RUSAK";
  catatanMedia?: "NORMAL" | "RUSAK";
  catatanRectifier?: "NORMAL" | "RUSAK";
  catatanBaterai?: "NORMAL" | "HATI_HATI" | "RUSAK";
  catatanLain?: string;

  // Status - Enums
  statusSebelum: "APPDISK" | "GAGAL_RC" | "OOP" | "INSCAN" | "BERHASIL_RC" | "LAIN_LAIN";
  statusSesudah: "APPDISK" | "GAGAL_RC" | "OOP" | "INSCAN" | "BERHASIL_RC" | "LAIN_LAIN";
  statusPekerjaan?: "SELESAI" | "PARSIAL" | "GAGAL";

  // Penutup
  pengawas: string;
  pelaksana: string;

  // Legacy fields (for backward compatibility)
  nomorSPJ?: string;
  pekerjaan?: string;
  namaAset?: string;
  tagSCADA?: string;
  bayPosisi?: string;
  teganganNominal?: string;
  detailLangkah?: string;
  hasilTahananIsolasi?: string;
  hasilPengukuranBeban?: string;
  catatanHasil?: string;
  durasiPekerjaan?: string;
  catatanTambahan?: string;

  status?: "DRAFT" | "PENDING";
}

export interface UpdateLaporanAkhirInput extends Partial<CreateLaporanAkhirInput> {}

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
  data: LaporanAkhir[];
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
  data: CreateLaporanAkhirInput,
  config?: import("axios").AxiosRequestConfig,
): Promise<LaporanAkhir> => {
  const response = await apiClient.post<ApiResponse<LaporanAkhir>>("/laporan-akhir", data, config);
  return handleResponse(response);
};

// Get all
export const getAll = async (params?: ListParams): Promise<ListResponse> => {
  const response = await apiClient.get<ApiResponse<ListResponse>>("/laporan-akhir", { params });
  return handleResponse(response);
};

// Get by ID
export const getById = async (id: string): Promise<LaporanAkhir> => {
  const response = await apiClient.get<ApiResponse<LaporanAkhir>>(`/laporan-akhir/${id}`);
  return handleResponse(response);
};

// Update
export const update = async (id: string, data: UpdateLaporanAkhirInput): Promise<LaporanAkhir> => {
  const response = await apiClient.put<ApiResponse<LaporanAkhir>>(`/laporan-akhir/${id}`, data);
  return handleResponse(response);
};

// Delete
export const remove = async (id: string): Promise<void> => {
  const response = await apiClient.delete<ApiResponse<void>>(`/laporan-akhir/${id}`);
  handleResponse(response);
};

// Validate
export const validate = async (id: string, data: ValidateInput): Promise<LaporanAkhir> => {
  const response = await apiClient.post<ApiResponse<LaporanAkhir>>(
    `/laporan-akhir/${id}/validate`,
    data,
  );
  return handleResponse(response);
};
