import apiClient from "./client";

// Export ZIP per laporan
export const exportZip = async (jenis: "awal" | "akhir", id: string): Promise<Blob> => {
  const response = await apiClient.get(`/export/zip/${jenis}/${id}`, {
    responseType: "blob",
  });
  return response.data;
};

// Export XLSX history
export const exportXlsx = async (params?: {
  jenis?: "ALL" | "AWAL" | "AKHIR";
  status?: string;
  startDate?: string;
  endDate?: string;
  rtupp?: string;
  team?: string;
}): Promise<Blob> => {
  const response = await apiClient.get("/export/xlsx/history", {
    params,
    responseType: "blob",
  });
  return response.data;
};

// Helper to download blob as file
export const downloadBlob = (blob: Blob, filename: string): void => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};
