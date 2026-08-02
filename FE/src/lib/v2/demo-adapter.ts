// VoltHub — DEMO data adapter.
//
// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  DEMO ONLY. Not production data.                                          ║
// ╚══════════════════════════════════════════════════════════════════════════╝
//
// Several concepts in the stakeholder demo (RC/SCADA status, VIP gardu, open
// tickets, operational health) have NO backend field yet — they will be fed by
// the OOP/INSCAN integration in a later phase (see dashboard/widgets.tsx
// DeviceStatusPanel). Until then this module DERIVES those values deterministically
// from the real entity id, so the demo looks alive and stays *consistent* across
// reloads and across screens (the same gardu always shows the same RC status).
//
// To wire real data later: replace the body of each `gardu*` function with a
// lookup against the live feed; the call sites and types stay the same.

/** Stable 32-bit hash of a string (FNV-1a-ish). Same input ⇒ same output. */
function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Deterministic [0,1) pseudo-random from an id + salt. */
function rand(id: string, salt: string): number {
  return (hash(id + salt) % 10000) / 10000;
}

// ── RC (Remote Control / SCADA) status ───────────────────────────────────────
// INSCAN = remote-controlled & telemetered (healthy); OOP = Out Of Operation
// (telecontrol down — the headline KPI); LOCAL = manual/local control only.
export type RcStatus = "INSCAN" | "OOP" | "LOCAL";

export const RC_STATUS_LABELS: Record<RcStatus, string> = {
  INSCAN: "RC Inscan",
  OOP: "RC OOP",
  LOCAL: "Lokal",
};

/** Realistic mix: ~70% INSCAN, ~17% OOP, ~13% LOCAL. */
export function garduRcStatus(id: string): RcStatus {
  const r = rand(id, "rc");
  if (r < 0.7) return "INSCAN";
  if (r < 0.87) return "OOP";
  return "LOCAL";
}

/** ~15% of gardu are flagged VIP (priority assets). */
export function garduIsVip(id: string): boolean {
  return rand(id, "vip") < 0.15;
}

// ── Operational status ────────────────────────────────────────────────────────
export type OperationalStatus = "NORMAL" | "WARNING" | "DOWN";

export const OPERATIONAL_LABELS: Record<OperationalStatus, string> = {
  NORMAL: "Normal",
  WARNING: "Perlu Perhatian",
  DOWN: "Gangguan",
};

/** OOP gardu skew toward DOWN/WARNING; everything else mostly NORMAL. */
export function garduOperational(id: string): OperationalStatus {
  const rc = garduRcStatus(id);
  const r = rand(id, "ops");
  if (rc === "OOP") return r < 0.6 ? "DOWN" : "WARNING";
  if (r < 0.82) return "NORMAL";
  if (r < 0.95) return "WARNING";
  return "DOWN";
}

/** Open maintenance tickets for a gardu (0–4, weighted toward 0). */
export function garduOpenTickets(id: string): number {
  const r = rand(id, "ticket");
  if (r < 0.55) return 0;
  if (r < 0.8) return 1;
  if (r < 0.93) return 2;
  if (r < 0.98) return 3;
  return 4;
}

/** Health score 0–100 (higher = healthier). Drives "Top Problem Gardu". */
export function garduHealthScore(id: string): number {
  const op = garduOperational(id);
  const base = op === "DOWN" ? 25 : op === "WARNING" ? 60 : 90;
  const jitter = Math.round(rand(id, "health") * 18) - 9; // ±9
  return Math.max(2, Math.min(100, base + jitter));
}

// ── Aggregate helpers (for dashboard KPIs over a list of gardu ids) ───────────
export interface GarduLike {
  id?: string;
  code?: string;
  name?: string;
  up3?: string | null;
  locationType?: string;
}

export interface GarduDemoStats {
  rcInscan: number;
  rcOop: number;
  rcLocal: number;
  vip: number;
  openTickets: number;
}

export function aggregateGarduStats(items: GarduLike[]): GarduDemoStats {
  const stats: GarduDemoStats = { rcInscan: 0, rcOop: 0, rcLocal: 0, vip: 0, openTickets: 0 };
  for (const g of items) {
    const id = g.id ?? "";
    const rc = garduRcStatus(id);
    if (rc === "INSCAN") stats.rcInscan++;
    else if (rc === "OOP") stats.rcOop++;
    else stats.rcLocal++;
    if (garduIsVip(id)) stats.vip++;
    stats.openTickets += garduOpenTickets(id);
  }
  return stats;
}

/** 14-day RC availability % trend (deterministic), for the "Performance Trend"
 *  card. Hovers in a realistic 95–99.5% band. `seed` keeps it stable per dataset. */
export function rcPerformanceTrend(
  seed: string,
  days = 14,
): Array<{ date: string; Performa: number }> {
  const out: Array<{ date: string; Performa: number }> = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const base = 95 + rand(seed, `perf${i}`) * 4.5; // 95–99.5
    out.push({
      date: d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" }),
      Performa: Math.round(base * 10) / 10,
    });
  }
  return out;
}

// ── HAR (report-level) DEMO fields ────────────────────────────────────────────
// The backend HAR report stores only locationId + reportDate. Number, type,
// report status, author, attachments, timeline & activity are DEMO-derived here
// (deterministic per report id) until those columns land in the backend.
export type HarType = "PREVENTIF" | "KOREKTIF" | "PREDIKTIF";
export const HAR_TYPE_LABELS: Record<HarType, string> = {
  PREVENTIF: "Preventif",
  KOREKTIF: "Korektif",
  PREDIKTIF: "Prediktif",
};
const HAR_TYPES: HarType[] = ["PREVENTIF", "KOREKTIF", "PREDIKTIF"];

export type HarReportStatus = "DRAFT" | "REVIEW" | "APPROVED" | "COMPLETED";
export const HAR_REPORT_STATUS_LABELS: Record<HarReportStatus, string> = {
  DRAFT: "Draft",
  REVIEW: "Review",
  APPROVED: "Disetujui",
  COMPLETED: "Selesai",
};
const HAR_REPORT_STATUSES: HarReportStatus[] = ["DRAFT", "REVIEW", "APPROVED", "COMPLETED"];

const DEMO_OFFICERS = [
  { name: "Budi Santoso", email: "budi.santoso@pln.co.id" },
  { name: "Siti Aminah", email: "siti.aminah@pln.co.id" },
  { name: "Agus Pratama", email: "agus.pratama@pln.co.id" },
  { name: "Dewi Lestari", email: "dewi.lestari@pln.co.id" },
  { name: "Rudi Hartono", email: "rudi.hartono@pln.co.id" },
];

export function harType(id: string): HarType {
  return HAR_TYPES[hash(id + "hartype") % HAR_TYPES.length];
}

export function harReportStatus(id: string): HarReportStatus {
  return HAR_REPORT_STATUSES[hash(id + "harstatus") % HAR_REPORT_STATUSES.length];
}

export function harCreatedBy(id: string): { name: string; email: string } {
  return DEMO_OFFICERS[hash(id + "harauthor") % DEMO_OFFICERS.length];
}

/** Stable HAR number like "HAR/2026/0042" (year from reportDate). */
export function harNumber(id: string, reportDate?: string): string {
  const year = reportDate ? new Date(reportDate).getFullYear() : new Date().getFullYear();
  const seq = (hash(id + "harno") % 9999) + 1;
  return `HAR/${year}/${String(seq).padStart(4, "0")}`;
}

export interface HarTimelineEvent {
  id: string;
  type: "created" | "updated" | "submitted" | "approved" | "validated";
  timestamp: Date;
  user?: { name: string; email?: string };
  details?: string;
}

/** Derived activity timeline reflecting the report's current status. */
export function harTimeline(id: string, reportDate?: string): HarTimelineEvent[] {
  const author = harCreatedBy(id);
  const status = harReportStatus(id);
  const base = reportDate ? new Date(reportDate).getTime() : Date.now();
  const day = 86400000;
  const events: HarTimelineEvent[] = [
    {
      id: `${id}-c`,
      type: "created",
      timestamp: new Date(base),
      user: author,
      details: "Laporan HAR dibuat dan draft awal disusun.",
    },
    {
      id: `${id}-u`,
      type: "updated",
      timestamp: new Date(base + day),
      user: author,
      details: "Detail aset & analisa kondisi diperbarui.",
    },
  ];
  if (status === "REVIEW" || status === "APPROVED" || status === "COMPLETED") {
    events.push({
      id: `${id}-s`,
      type: "submitted",
      timestamp: new Date(base + 2 * day),
      user: author,
      details: "Laporan diajukan untuk direview supervisor.",
    });
  }
  if (status === "APPROVED" || status === "COMPLETED") {
    const sup = DEMO_OFFICERS[hash(id + "harsup") % DEMO_OFFICERS.length];
    events.push({
      id: `${id}-a`,
      type: "approved",
      timestamp: new Date(base + 3 * day),
      user: sup,
      details: "Laporan disetujui.",
    });
  }
  if (status === "COMPLETED") {
    events.push({
      id: `${id}-v`,
      type: "validated",
      timestamp: new Date(base + 4 * day),
      user: harCreatedBy(id),
      details: "Tindak lanjut selesai & laporan ditutup.",
    });
  }
  return events.reverse(); // newest first
}

export interface HarAttachment {
  id: string;
  name: string;
  type: string;
  sizeKb: number;
}

/** 0–3 derived attachments per report. */
export function harAttachments(id: string, reportDate?: string): HarAttachment[] {
  const count = hash(id + "haratt") % 4;
  const year = reportDate ? new Date(reportDate).getFullYear() : new Date().getFullYear();
  const tpl = [
    { suffix: "berita-acara.pdf", type: "PDF" },
    { suffix: "foto-lapangan.jpg", type: "JPG" },
    { suffix: "hasil-ukur.xlsx", type: "XLSX" },
  ];
  return Array.from({ length: count }, (_, i) => ({
    id: `${id}-att-${i}`,
    name: `HAR-${year}-${tpl[i].suffix}`,
    type: tpl[i].type,
    sizeKb: 80 + (hash(id + i) % 2400),
  }));
}

/** The N least-healthy gardu, worst first — for the "Top Problem Gardu" card. */
export function topProblemGardu<T extends GarduLike>(
  items: T[],
  n = 6,
): Array<T & { healthScore: number; operational: OperationalStatus; openTickets: number }> {
  return items
    .map((g) => ({
      ...g,
      healthScore: garduHealthScore(g.id ?? ""),
      operational: garduOperational(g.id ?? ""),
      openTickets: garduOpenTickets(g.id ?? ""),
    }))
    .sort((a, b) => a.healthScore - b.healthScore)
    .slice(0, n);
}
