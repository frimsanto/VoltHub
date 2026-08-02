// API Layer - VoltHub Frontend
// Export with prefixes to avoid naming conflicts

export * from "./client";

// Auth
export * from "./auth";

// Dashboard
export * from "./dashboard";

// Laporan APIs - export as namespaced objects
import * as laporanAwalApi from "./laporanAwal";
import * as laporanAkhirApi from "./laporanAkhir";

export { laporanAwalApi, laporanAkhirApi };

// Also export types individually
export type {
  LaporanAwal,
  CreateLaporanAwalInput,
  UpdateLaporanAwalInput,
  PersonilSnapshot,
} from "./laporanAwal";

export type {
  LaporanAkhir,
  CreateLaporanAkhirInput,
  UpdateLaporanAkhirInput,
} from "./laporanAkhir";

// History
export * from "./history";

// Upload & Export
export * from "./upload";
export { uploadDocumentationAllInOne } from "./upload";
export * from "./export";
