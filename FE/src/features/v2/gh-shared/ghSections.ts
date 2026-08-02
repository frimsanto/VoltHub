// VoltHub — definisi section & field bersama untuk Laporan Inspeksi GH & HAR GH
// (152 kolom Excel, struktur IDENTIK). Dipakai oleh kedua modul (BE reuse pola sama:
// laporan-har-gh.validation reuse export laporan-inspeksi-gh.validation).
export type GhFieldKind = "text" | "textarea" | "number" | "select" | "select-other";
export interface GhFieldDef {
  name: string;
  label: string;
  kind?: GhFieldKind;
  options?: readonly string[];
}
export type GhSectionVariant = "flat" | "kubikel";
export interface GhSectionDef {
  key: string;
  label: string;
  variant: GhSectionVariant;
  absentable?: boolean;
  fields?: GhFieldDef[];
}

const kesimpulan: GhFieldDef = {
  name: "kesimpulan",
  label: "Kesimpulan Kondisi",
  kind: "select",
  options: ["BAIK", "PERLU_PENGECEKAN", "RUSAK"],
};
const keterangan: GhFieldDef = { name: "keterangan", label: "Keterangan", kind: "textarea" };
const kondisiOnOff: GhFieldDef = { name: "kondisi", label: "Kondisi", kind: "select", options: ["ON", "OFF"] };
const mcbStatus: (name: string, label: string) => GhFieldDef = (name, label) => ({
  name,
  label,
  kind: "select",
  options: ["ADA - ON", "ADA - OFF", "TIDAK ADA"],
});
const hasilUkur: (name: string, label: string) => GhFieldDef = (name, label) => ({
  name,
  label,
  kind: "number",
});

export const GH_KESIMPULAN_LABELS: Record<string, string> = {
  BAIK: "Baik",
  PERLU_PENGECEKAN: "Perlu Pengecekan",
  RUSAK: "Rusak",
};

export const GH_SECTIONS: GhSectionDef[] = [
  {
    key: "supplyTr",
    label: "Supply TR",
    variant: "flat",
    fields: [
      { name: "supplyTr", label: "Supply TR", kind: "select", options: ["TIDAK ADA", "RAK TR", "TARIKAN SR", "KONSUMEN"] },
      { name: "mcbSumberRectifier", label: "MCB Sumber Rectifier", kind: "select", options: ["TIDAK ADA", "ADA - ON", "ADA - OFF"] },
      keterangan,
      kesimpulan,
    ],
  },
  {
    key: "rectifier",
    label: "Rectifier",
    variant: "flat",
    fields: [
      { name: "merk", label: "Merk" },
      { name: "type", label: "Type" },
      { name: "serialNumber", label: "Serial Number" },
      kondisiOnOff,
      mcbStatus("mcbSupply220", "MCB Supply 220V"),
      hasilUkur("hasilUkurMcb220", "Hasil Ukur MCB 220V"),
      mcbStatus("mcbBaterai48", "MCB Baterai 48VDC"),
      hasilUkur("hasilUkurMcbBaterai48", "Hasil Ukur MCB Baterai 48VDC"),
      mcbStatus("mcbLoad48", "MCB Load 48VDC"),
      hasilUkur("hasilUkurMcbLoad48", "Hasil Ukur MCB Load 48VDC"),
      mcbStatus("mcb24", "MCB 24VDC"),
      hasilUkur("hasilUkurMcb24", "Hasil Ukur MCB 24VDC"),
      mcbStatus("mcb12", "MCB/Fuse 12VDC"),
      hasilUkur("hasilUkurMcb12", "Hasil Ukur MCB 12VDC"),
      keterangan,
      kesimpulan,
      {
        name: "kategori",
        label: "Kategori Rectifier",
        kind: "select",
        options: ["NORMAL", "PERALATAN RECTIFIER UTAMA", "RECTIFIER TIDAK BACKUP", "SUMBER TEGANGAN TIDAK ADA"],
      },
    ],
  },
  {
    key: "baterai",
    label: "Baterai",
    variant: "flat",
    fields: [
      { name: "jenis", label: "Jenis Baterai", kind: "select", options: ["VRLA", "NiCAD"] },
      { name: "merk", label: "Merk" },
      { name: "type", label: "Type" },
      { name: "jumlahCell", label: "Jumlah Cell/Battery", kind: "number" },
      {
        name: "levelAir",
        label: "Level Air Battery",
        kind: "select",
        options: ["MAX", "MID (SEDANG)", "MIN", "LEVEL AIR TIDAK RATA", "BATERAI KERING", "TIDAK ADA BATERAI"],
      },
      {
        name: "backupSaatMcbOff",
        label: "Backup saat MCB sumber 220 diturunkan?",
        kind: "select-other",
        options: [
          "BACK UP (220 VAC OOF, RECTI ON)",
          "TIDAK BACK UP (220 VAC OFF, RECTI ON [48 VDC DOWN < 46 VDC])",
          "TIDAK BACK UP (220 VAC OFF, RECTI OFF)",
          "TIDAK ADA BATERAI",
          "RECTIFIER RUSAK",
        ],
      },
      keterangan,
      kesimpulan,
      { name: "kategori", label: "Kategori Baterai", kind: "select", options: ["NORMAL", "BATERAI RUSAK", "TIDAK ADA BATERAI"] },
    ],
  },
  {
    key: "rtu",
    label: "RTU",
    variant: "flat",
    fields: [
      { name: "merk", label: "Merk" },
      { name: "type", label: "Type" },
      { name: "serialNumber", label: "Serial Number" },
      kondisiOnOff,
      mcbStatus("mcbLoad48", "MCB Load 48VDC"),
      hasilUkur("hasilUkurMcbLoad48", "Hasil Ukur MCB Load 48VDC"),
      { name: "kondisiDisplay", label: "Kondisi Display", kind: "select", options: ["ON", "OFF", "TIDAK ADA LAYAR"] },
      mcbStatus("mcbFuse1224", "MCB/Fuse 12VDC/24VDC"),
      hasilUkur("hasilUkurMcbFuse1224", "Hasil Ukur MCB/Fuse 12VDC/24VDC"),
      keterangan,
      kesimpulan,
      { name: "kategori", label: "Kategori RTU", kind: "select", options: ["NORMAL", "SUMBER TEGANGAN TIDAK ADA"] },
    ],
  },
  {
    key: "media1",
    label: "Media 1",
    variant: "flat",
    fields: [
      { name: "serialNumber", label: "Serial Number" },
      { name: "brand", label: "Brand Media" },
      { name: "model", label: "Model Media" },
      { name: "pairChannel", label: "Pair Channel" },
      { name: "asdu", label: "ASDU" },
      { name: "ipModem", label: "IP Modem" },
      { name: "ipSim1", label: "IP SIM 1" },
      { name: "ipSim2", label: "IP SIM 2" },
      { name: "ipWan", label: "IP WAN" },
      { name: "ipGwWan", label: "IP GW WAN" },
      { name: "jumlahMedia", label: "Jumlah Media", kind: "select", options: ["ADA 1", "TIDAK ADA"] },
      { name: "merk", label: "Merk Media" },
      { name: "type", label: "Type Media", kind: "select", options: ["ROUTER", "TIDAK ADA"] },
      { name: "serialNumberMedia", label: "Serial Number Media" },
      { name: "kondisi", label: "Kondisi Media", kind: "select", options: ["ON / RUN", "OFF", "TIDAK ADA"] },
      mcbStatus("mcbFuse1224", "MCB/Fuse 12VDC/24VDC"),
      hasilUkur("hasilUkurMcbFuse1224", "Hasil Ukur MCB/Fuse 12VDC/24VDC"),
      { name: "antena", label: "Antena Media", kind: "select", options: ["ADA", "TIDAK ADA"] },
      { name: "kondisiAntena", label: "Kondisi Antena", kind: "select", options: ["NORMAL", "PERLU PENGECEKAN LANJUT", "RUSAK/TIDAK LAYAK", "TIDAK ADA"] },
      keterangan,
      kesimpulan,
      {
        name: "kategori",
        label: "Kategori Media",
        kind: "select",
        options: ["NORMAL", "BELUM INTEGRASI", "MODEM PROBLEM", "ICON PROBLEM", "SIMCARD PROBLEM", "TIDAK ADA MEDIA", "SUMBER TEGANGAN TIDAK ADA"],
      },
    ],
  },
  {
    key: "media2",
    label: "Media 2",
    variant: "flat",
    absentable: true,
    fields: [], // sama seperti Media 1 — diisi ulang di bawah agar tak duplikat referensi
  },
  { key: "kubikel", label: "Kubikel (Penyulang)", variant: "kubikel" },
  {
    key: "fdiRelay",
    label: "FDI / Relay Proteksi",
    variant: "flat",
    absentable: true,
    fields: [
      { name: "ada", label: "Ada FDI/Relay Proteksi? (bukan PB/Trafo)", kind: "select", options: ["ADA", "TIDAK ADA"] },
      { name: "jumlah", label: "Jumlah FDI/Relay Proteksi", kind: "number" },
      { name: "listPenyulangMerk", label: "List Penyulang/Arah & Merk FDI/Relay", kind: "textarea" },
      { name: "jumlahTidakIntegrasi", label: "Jumlah Tidak Integrasi SCADA", kind: "number" },
      { name: "catatanTidakIntegrasi", label: "Catatan Tidak Integrasi SCADA", kind: "textarea" },
    ],
  },
  {
    key: "aco",
    label: "ACO",
    variant: "flat",
    absentable: true,
    fields: [
      { name: "ada", label: "Ada ACO?", kind: "select", options: ["ADA", "TIDAK ADA"] },
      { name: "jumlah", label: "Jumlah ACO", kind: "number" },
      { name: "jumlahSudahIntegrasi", label: "Jumlah Sudah Integrasi SCADA", kind: "number" },
      { name: "jumlahTidakIntegrasi", label: "Jumlah Tidak Integrasi SCADA", kind: "number" },
      { name: "catatanTidakIntegrasi", label: "Catatan Tidak Integrasi SCADA", kind: "textarea" },
    ],
  },
];
// Media 2 mirrors Media 1 fields exactly (Excel: MERK MEDIA-2 … KATEGORI MEDIA-2).
GH_SECTIONS.find((s) => s.key === "media2")!.fields = GH_SECTIONS.find((s) => s.key === "media1")!.fields;

// ── KUBIKEL — entri dinamis per penyulang ─────────────────────────────────────
export interface RelayDetailPair {
  cubicle?: string | null;
  master?: string | null;
}
export interface RelayDetail {
  cbtr?: RelayDetailPair;
  gft?: RelayDetailPair;
  igft?: RelayDetailPair;
  oct?: RelayDetailPair;
  ioct?: RelayDetailPair;
  bebanI1?: RelayDetailPair;
  bebanI2?: RelayDetailPair;
  bebanI3?: RelayDetailPair;
  amfN?: RelayDetailPair;
  amfR?: RelayDetailPair;
  amfS?: RelayDetailPair;
  amfT?: RelayDetailPair;
}
export interface KubikelEntry {
  penyulangId?: string | null; // null = entri manual (teks)
  namaPenyulang: string;
  merekCubicle?: string | null;
  tipeRc?: string | null;
  statusCubicle?: string | null;
  statusCubicleMaster?: string | null;
  statusLrCubicle?: string | null;
  statusLrMaster?: string | null;
  mfsCubicle?: string | null;
  mfsMaster?: string | null;
  hfdCubicle?: string | null;
  hfdMaster?: string | null;
  testRcDummy?: string | null;
  statusRc?: string | null;
  catatan?: string | null;
  relayDetail?: RelayDetail | null;
}

export const emptyKubikelEntry = (over: Partial<KubikelEntry> = {}): KubikelEntry => ({
  penyulangId: null,
  namaPenyulang: "",
  merekCubicle: "",
  tipeRc: "",
  statusCubicle: "",
  statusCubicleMaster: "",
  statusLrCubicle: "",
  statusLrMaster: "",
  mfsCubicle: "",
  mfsMaster: "",
  hfdCubicle: "",
  hfdMaster: "",
  testRcDummy: "",
  statusRc: "",
  catatan: "",
  relayDetail: null,
  ...over,
});

export const RELAY_DETAIL_GROUPS: { key: keyof RelayDetail; label: string }[] = [
  { key: "cbtr", label: "CBTR" },
  { key: "gft", label: "GFT" },
  { key: "igft", label: "IGFT" },
  { key: "oct", label: "OCT" },
  { key: "ioct", label: "IOCT" },
  { key: "bebanI1", label: "Beban I1" },
  { key: "bebanI2", label: "Beban I2" },
  { key: "bebanI3", label: "Beban I3" },
  { key: "amfN", label: "AMF N" },
  { key: "amfR", label: "AMF R" },
  { key: "amfS", label: "AMF S" },
  { key: "amfT", label: "AMF T" },
];

export const KUBIKEL_STATUS_OPTIONS = {
  tipeRc: ["CBO", "LBS"] as const,
  statusCubicle: ["OPEN", "CLOSE"] as const,
  statusLr: ["LOCAL", "REMOTE", "INVALID"] as const,
  mfsHfd: ["NORMAL/SESUAI", "TIDAK TIMBUL/PROBLEM"] as const,
  testRcDummy: ["RCC/O KUBIKEL", "RCC/O DUMMY", "TIDAK DILAKUKAN"] as const,
  statusRc: ["SIAP RC", "TIDAK SIAP RC"] as const,
  relayDetailPair: ["NORMAL/SESUAI", "TIDAK TIMBUL/PROBLEM"] as const,
};

/** Validasi kubikel ARRAY-AWARE — mirror BE assertKubikelSubmittable:
 *  min 1 entri + tiap entri wajib namaPenyulang+statusCubicle+statusRc.
 *  relayDetail TIDAK wajib. */
export function validateKubikelForSubmit(kubikel: unknown): string | null {
  const arr = Array.isArray(kubikel) ? (kubikel as KubikelEntry[]) : [];
  if (arr.length === 0) return "Tambahkan minimal 1 penyulang";
  for (let i = 0; i < arr.length; i++) {
    const e = arr[i];
    if (!e.namaPenyulang?.trim()) return `Penyulang #${i + 1}: nama penyulang wajib`;
    if (!e.statusCubicle) return `Penyulang #${i + 1}: status cubicle wajib`;
    if (!e.statusRc) return `Penyulang #${i + 1}: status RC wajib`;
  }
  return null;
}
