// VoltHub — SCADA GI resource (pembanding "DI MASTER" + Berhasil RC).
// Backend: BE/src/modules/scada-gi. Dipakai form GI untuk auto-fill kolom
// "DI MASTER" dan menampilkan hasil evaluasi Berhasil RC.
import { useQuery } from "@tanstack/react-query";
import { v2Get } from "@/lib/api/v2";

export interface ScadaMasterPoints {
  cb: string | null;
  lr: string | null;
  es: string | null;
  rack: string | null;
  msf: string | null;
  psf: string | null;
  csf: string | null;
  mpuf: string | null;
}

export interface BerhasilRc {
  rcSuccess: boolean;
  reasons: string[];
  lr: string | null;
  es: string | null;
}

export interface ScadaMaster {
  snapshotId: string;
  rtuName: string;
  garduName: string | null;
  importedAt: string;
  master: ScadaMasterPoints;
  berhasilRc: BerhasilRc;
  points: Array<{
    element: string;
    info: string | null;
    value: string | null;
    bay: string | null;
    hasCommand: boolean;
  }>;
}

/** Daftar nama RTU yang sudah punya snapshot (dropdown pemilihan). */
export function useScadaRtuNames() {
  return useQuery({
    queryKey: ["scada-gi", "rtus"],
    queryFn: () => v2Get<string[]>("/gi/scada/rtus"),
  });
}

/** Master SCADA terbaru untuk satu RTU. enabled hanya bila rtu dipilih. */
export function useScadaMaster(rtu?: string | null) {
  return useQuery({
    queryKey: ["scada-gi", "master", rtu],
    queryFn: () => v2Get<ScadaMaster>(`/gi/scada/points?rtu=${encodeURIComponent(rtu as string)}`),
    enabled: !!rtu,
    retry: false,
  });
}
