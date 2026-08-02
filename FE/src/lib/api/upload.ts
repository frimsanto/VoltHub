import apiClient, { ApiResponse, handleResponse } from "./client";
import { compressMedia } from "@/lib/utils/mediaCompression";

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
  uploadedBy?: {
    id: string;
    name: string;
  };
}

export interface UploadResponse {
  uploaded: number;
  attachments: Attachment[];
}

// Upload files (Legacy - max 20 files)
export const uploadFiles = async (
  jenis: "laporan-awal" | "laporan-akhir",
  laporanId: string,
  files: File[],
  category: string,
  onProgress?: (progress: number) => void,
): Promise<UploadResponse> => {
  // Compress images + videos client-side; other files pass through untouched.
  const prepared = await compressMedia(files);

  const formData = new FormData();
  formData.append("laporanId", laporanId);
  formData.append("category", category);
  prepared.forEach((file) => formData.append("files", file));

  const response = await apiClient.post<ApiResponse<UploadResponse>>(`/upload/${jenis}`, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
    onUploadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onProgress(progress);
      }
    },
  });
  return handleResponse(response);
};

// All-in-One Documentation Upload (50 files, Images + Videos)
export const uploadDocumentationAllInOne = async (
  jenis: "laporan-awal" | "laporan-akhir",
  laporanId: string,
  files: File[],
  onProgress?: (progress: number) => void,
): Promise<UploadResponse> => {
  // Compress images + videos client-side; other files pass through untouched.
  const prepared = await compressMedia(files);

  const formData = new FormData();
  formData.append("laporanId", laporanId);
  formData.append("category", "FOTO_PEKERJAAN"); // All-in-One documentation bucket
  prepared.forEach((file) => formData.append("files", file));

  const response = await apiClient.post<ApiResponse<UploadResponse>>(
    `/upload/${jenis}/all-in-one`,
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(progress);
        }
      },
    },
  );
  return handleResponse(response);
};

interface TaggedFile {
  file: File;
  category: "LOGGER_FILE" | "SLD_FILE" | "FOTO_HASIL";
}

// Each batch is its own multipart request. Keeping requests small (by count AND
// by total bytes) is what prevents the connection resets / timeouts we saw when
// 50+ full-size photos were pushed in a single POST.
const MAX_FILES_PER_BATCH = 6;
const MAX_BYTES_PER_BATCH = 8 * 1024 * 1024; // ~8 MB
const UPLOAD_CONCURRENCY = 3;
const BATCH_TIMEOUT_MS = 120_000; // generous per-batch timeout; default client timeout is 30s

function chunkByCountAndSize(items: TaggedFile[]): TaggedFile[][] {
  const batches: TaggedFile[][] = [];
  let current: TaggedFile[] = [];
  let bytes = 0;
  for (const item of items) {
    const tooMany = current.length >= MAX_FILES_PER_BATCH;
    const tooBig = bytes + item.file.size > MAX_BYTES_PER_BATCH && current.length > 0;
    if (tooMany || tooBig) {
      batches.push(current);
      current = [];
      bytes = 0;
    }
    current.push(item);
    bytes += item.file.size;
  }
  if (current.length) batches.push(current);
  return batches;
}

async function uploadBatch(
  laporanId: string,
  batch: TaggedFile[],
  onBatchProgress: (loaded: number) => void,
): Promise<Attachment[]> {
  const formData = new FormData();
  formData.append("laporanId", laporanId);
  batch.forEach(({ file, category }) => {
    formData.append("files", file);
    formData.append("categories", category);
  });

  const response = await apiClient.post<ApiResponse<UploadResponse>>(
    `/upload/laporan-akhir/categorized`,
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: BATCH_TIMEOUT_MS,
      onUploadProgress: (progressEvent) => onBatchProgress(progressEvent.loaded || 0),
    },
  );
  return handleResponse(response).attachments;
}

// Categorized Documentation Upload for Laporan Akhir (Logger, SLD, Dokumentasi Hasil).
// Images are compressed client-side and uploaded in small concurrent batches so
// large documentation sets (50+ photos) upload quickly and reliably.
export const uploadLaporanAkhirDocumentation = async (
  laporanId: string,
  files: {
    logger?: File[];
    sld?: File[];
    dokumentasiHasil?: File[];
  },
  onProgress?: (progress: number) => void,
): Promise<UploadResponse> => {
  // Compress the photo/video-heavy buckets (SLD + Dokumentasi). Logger files are
  // XLSX and pass through untouched.
  const [sldCompressed, dokCompressed] = await Promise.all([
    compressMedia(files.sld ?? []),
    compressMedia(files.dokumentasiHasil ?? []),
  ]);

  const tagged: TaggedFile[] = [
    ...(files.logger ?? []).map((file) => ({ file, category: "LOGGER_FILE" as const })),
    ...sldCompressed.map((file) => ({ file, category: "SLD_FILE" as const })),
    ...dokCompressed.map((file) => ({ file, category: "FOTO_HASIL" as const })),
  ];

  if (tagged.length === 0) {
    return { uploaded: 0, attachments: [] };
  }

  const batches = chunkByCountAndSize(tagged);
  const totalBytes = tagged.reduce((sum, t) => sum + t.file.size, 0) || 1;

  // Track per-batch progress so concurrent uploads report a single aggregate %.
  const loadedPerBatch = new Array(batches.length).fill(0);
  const reportProgress = (): void => {
    if (!onProgress) return;
    const loaded = loadedPerBatch.reduce((a, b) => a + b, 0);
    onProgress(Math.min(100, Math.round((loaded * 100) / totalBytes)));
  };

  const attachments: Attachment[] = [];
  let nextBatch = 0;
  const worker = async (): Promise<void> => {
    while (nextBatch < batches.length) {
      const idx = nextBatch++;
      const result = await uploadBatch(laporanId, batches[idx], (loaded) => {
        loadedPerBatch[idx] = loaded;
        reportProgress();
      });
      // Mark the batch fully done in case the final progress event was coarse.
      loadedPerBatch[idx] = batches[idx].reduce((s, t) => s + t.file.size, 0);
      reportProgress();
      attachments.push(...result);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(UPLOAD_CONCURRENCY, batches.length) }, worker),
  );

  return { uploaded: attachments.length, attachments };
};

// Get attachments by laporan
export const getAttachmentsByLaporan = async (
  jenis: "laporan-awal" | "laporan-akhir",
  laporanId: string,
): Promise<Attachment[]> => {
  const response = await apiClient.get<ApiResponse<Attachment[]>>(
    `/upload/laporan/${jenis}/${laporanId}`,
  );
  return handleResponse(response);
};

// Get attachment metadata
export const getAttachment = async (id: string): Promise<Attachment> => {
  const response = await apiClient.get<ApiResponse<Attachment>>(`/upload/${id}`);
  return handleResponse(response);
};

// Delete attachment
export const deleteAttachment = async (id: string): Promise<void> => {
  const response = await apiClient.delete<ApiResponse<void>>(`/upload/${id}`);
  handleResponse(response);
};

// Fetch attachment bytes via the authenticated API client (Bearer token).
// Needed because /upload/preview/:id and /upload/:id are behind auth, so a raw
// <img src> / anchor href would be rejected with 401.
export const fetchAttachmentBlob = async (id: string, download = false): Promise<Blob> => {
  const url = download ? `/upload/${id}?download=true` : `/upload/preview/${id}`;
  const response = await apiClient.get(url, { responseType: "blob" });
  return response.data;
};

// Download attachment URL
export const getDownloadUrl = (id: string): string => {
  const baseURL = import.meta.env.VITE_API_URL || "http://localhost:3001/api";
  return `${baseURL}/upload/${id}?download=true`;
};

// Preview attachment URL
export const getPreviewUrl = (id: string): string => {
  const baseURL = import.meta.env.VITE_API_URL || "http://localhost:3001/api";
  return `${baseURL}/upload/preview/${id}`;
};
