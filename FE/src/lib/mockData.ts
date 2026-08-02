export const RTUPP_LIST = [
  "RTUPP Jakarta Selatan",
  "RTUPP Jakarta Pusat",
  "RTUPP Jakarta Timur",
  "RTUPP Jakarta Barat",
  "RTUPP Jakarta Utara",
  "RTUPP Tangerang",
  "RTUPP Bekasi",
  "RTUPP Depok",
];

export const TEAMS = [
  "Team Alpha-1",
  "Team Alpha-2",
  "Team Bravo-1",
  "Team Charlie-1",
  "Team Delta-1",
  "Supervisor Pusat",
];

export type ReportType = "Awal" | "Akhir";
export type ReportStatus = "Draft" | "Pending" | "Approved" | "Rejected";

export interface Report {
  id: string;
  type: ReportType;
  petugas: string;
  rtupp: string;
  team: string;
  status: ReportStatus;
  date: string;
  spj: string;
  lokasi: string;
  pekerjaan: string;
}

const names = [
  "Budi Santoso",
  "Dewi Lestari",
  "Hendra Pratama",
  "Siti Nurhaliza",
  "Joko Susilo",
  "Maya Sari",
  "Rizki Aditya",
  "Putri Wulandari",
  "Bagas Maulana",
  "Indra Permana",
  "Nadya Kirana",
  "Fajar Hidayat",
];
const lokasi = [
  "Gardu GI 150kV Cawang",
  "Gardu Distribusi GI-024 Senayan",
  "Gardu Hubung Sudirman",
  "Penyulang PNH-01 Pondok Indah",
  "GI 70kV Tanjung Priok",
  "Gardu Distribusi Mampang",
  "Penyulang KMG-12 Kemang",
  "GI Kelapa Gading",
];
const pekerjaan = [
  "Penggantian Kabel SUTM 20kV",
  "Pemeliharaan Trafo Distribusi 200 kVA",
  "Inspeksi Termovisi Gardu Induk",
  "Pemasangan FCO Tiang 14m",
  "Recloser Setting & Test",
  "Pemeliharaan PMT 20kV",
  "Manuver Penyulang Indikasi Gangguan",
  "Cleaning Isolator Bushing Trafo",
];

const statuses: ReportStatus[] = [
  "Approved",
  "Pending",
  "Rejected",
  "Draft",
  "Approved",
  "Pending",
];
const types: ReportType[] = ["Awal", "Akhir"];

export const REPORTS: Report[] = Array.from({ length: 48 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - Math.floor(i / 2));
  return {
    id: `RPT-2026-${String(1000 + i)}`,
    type: types[i % types.length],
    petugas: names[i % names.length],
    rtupp: RTUPP_LIST[i % RTUPP_LIST.length],
    team: TEAMS[i % TEAMS.length],
    status: statuses[i % statuses.length],
    date: d.toISOString(),
    spj: `SPJ/${2026}/${String(2000 + i)}`,
    lokasi: lokasi[i % lokasi.length],
    pekerjaan: pekerjaan[i % pekerjaan.length],
  };
});

export const DASHBOARD_TREND = Array.from({ length: 14 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - (13 - i));
  return {
    day: d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" }),
    awal: 8 + Math.floor(Math.random() * 12),
    akhir: 6 + Math.floor(Math.random() * 10),
  };
});

export const STATUS_PIE = [
  { name: "Approved", value: 142, color: "var(--color-success)" },
  { name: "Pending", value: 38, color: "var(--color-warning)" },
  { name: "Rejected", value: 9, color: "var(--color-destructive)" },
  { name: "Draft", value: 21, color: "var(--color-muted-foreground)" },
];

export const DEVICE_HEALTH = [
  { name: "Gardu Induk", online: 24, total: 26 },
  { name: "Gardu Distribusi", online: 184, total: 192 },
  { name: "Recloser", online: 58, total: 60 },
  { name: "FCO Network", online: 312, total: 320 },
];

export const RECENT_ACTIVITY = [
  {
    id: 1,
    who: "Budi Santoso",
    what: "Submit Laporan Akhir",
    target: "RPT-2026-1031",
    time: "2 menit lalu",
    status: "success" as const,
  },
  {
    id: 2,
    who: "Rina Hartati",
    what: "Validasi Approved",
    target: "RPT-2026-1029",
    time: "8 menit lalu",
    status: "success" as const,
  },
  {
    id: 3,
    who: "Hendra Pratama",
    what: "Submit Laporan Awal",
    target: "RPT-2026-1027",
    time: "21 menit lalu",
    status: "info" as const,
  },
  {
    id: 4,
    who: "Siti Nurhaliza",
    what: "Laporan Ditolak",
    target: "RPT-2026-1024",
    time: "47 menit lalu",
    status: "danger" as const,
  },
  {
    id: 6,
    who: "Joko Susilo",
    what: "Upload Evidence",
    target: "RPT-2026-1019",
    time: "2 jam lalu",
    status: "info" as const,
  },
];

export const USERS_DATA = names.map((n, i) => ({
  id: `USR-${String(1001 + i)}`,
  name: n,
  email: `${n.split(" ")[0].toLowerCase()}.${n.split(" ")[1]?.toLowerCase() || "pln"}@pln.co.id`,
  phone: `0812${String(10000000 + i * 12345).slice(0, 8)}`,
  role: (i % 6 === 0 ? "admin" : i % 9 === 0 ? "superadmin" : "petugas") as
    | "petugas"
    | "admin"
    | "superadmin",
  rtupp: RTUPP_LIST[i % RTUPP_LIST.length],
  team: TEAMS[i % TEAMS.length],
  status: (i % 7 === 0 ? "inactive" : "active") as "active" | "inactive",
  lastLogin: `${1 + (i % 12)} jam lalu`,
}));
