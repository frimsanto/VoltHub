import type { HistoryItem } from "@/lib/api/history";

/**
 * Sumber data laporan bisa berasal dari beberapa jenis (AWAL/AKHIR),
 * dengan field yang berbeda-beda. `ReportLike` menambah field opsional non-`HistoryItem`
 * yang dipakai di beberapa view (mis. monitoring memakai `any`).
 */
export type ReportLike = HistoryItem & {
  jenisPekerjaan?: string;
  gardu?: string;
};

/**
 * Judul laporan — fallback antar-jenis. Hanya satu field yang terisi per jenis,
 * sehingga urutan bersifat superset non-destruktif (tidak mengubah nilai yang sudah tampil).
 *   AWAL → pekerjaan · AKHIR → namaAset
 */
export function getReportTitle(r: ReportLike): string | undefined {
  return r.pekerjaan || r.jenisPekerjaan || r.namaAset || undefined;
}

/**
 * Lokasi laporan — fallback antar-jenis.
 *   AWAL → lokasiGardu · AKHIR → gardu
 */
export function getReportLocation(r: ReportLike): string | undefined {
  return r.lokasiGardu || r.gardu || undefined;
}
