// VoltHub — AI Assistant answer engine (backend-backed).
//
// The assistant reads the WHOLE database, not a client-side sample: every answer
// is assembled from real aggregate/search endpoints —
//   • GET /dashboard/overview         → DB-wide counts, asset breakdown, critical assets, tickets
//   • GET /scada-realtime/summary     → real RC IN-SCAN / OOP / %AVA
//   • GET /scada-realtime/gardu       → the actual OOP gardu list (paginated)
//   • GET /ai/assets/search?q=        → resolve ANY gardu in the DB + its assets/inspection/HAR
//
// Intent detection is still local (deterministic keyword routing), but the data
// behind each answer is live. To swap in a real LLM later, keep the `Answer`
// shape and replace `answerQuery` with a tool-calling backend round-trip.

import { Building2, BatteryCharging, Boxes, RadioTower, Wifi, type LucideIcon } from "lucide-react";
import { AssetStatusBadge } from "@/components/v2/StatusBadge";
import { v2Get } from "@/lib/api/v2";
import apiClient from "@/lib/api/client";
import type { ApiResponse } from "@/lib/api/client";
import type { DashboardOverview } from "@/features/v2/dashboard/api";
import type { ScadaSummary, ScadaGarduRow } from "@/features/v2/scada-realtime/api";
import type { AiSearchResult } from "@/features/v2/ai/api";
import { locationLabel } from "@/lib/utils";
import type { ReactNode } from "react";

export interface AnswerItem {
  to?: string;
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  badge?: ReactNode;
}
export interface AnswerStat {
  label: string;
  value: string | number;
  tone?: "default" | "good" | "warn" | "bad";
}
export interface Answer {
  text: string;
  stats?: AnswerStat[];
  items?: AnswerItem[];
}
export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  stats?: AnswerStat[];
  items?: AnswerItem[];
}

const ASSET_TYPE_LABELS: Record<string, string> = {
  RTU: "RTU",
  FDI: "FDI",
  RECTIFIER: "Rectifier",
  BATTERY_BANK: "Bank Baterai",
  ROUTER: "Router",
  MODEM: "Modem",
  RADIO: "Radio",
};

// Keyword → asset type, for "berapa rtu / modem / baterai" style questions.
const ASSET_TYPE_KEYWORDS: Array<[RegExp, string]> = [
  [/\brtu\b/, "RTU"],
  [/\bfdi\b/, "FDI"],
  [/rectifier|rektifier|penyearah/, "RECTIFIER"],
  [/baterai|battery|aki/, "BATTERY_BANK"],
  [/router/, "ROUTER"],
  [/modem/, "MODEM"],
  [/radio/, "RADIO"],
];

const assetIcon = (type?: string): LucideIcon =>
  type === "BATTERY_BANK"
    ? BatteryCharging
    : type === "MODEM" || type === "ROUTER" || type === "RADIO"
      ? Wifi
      : Boxes;

// ── Live data fetchers (short module-level cache so repeated questions are
// instant and don't re-hit the network on every message). ─────────────────────
const TTL = 60_000;
const cache = new Map<string, { t: number; v: unknown }>();
async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < TTL) return hit.v as T;
  const v = await fn();
  cache.set(key, { t: Date.now(), v });
  return v;
}

const fetchOverview = () =>
  cached("overview", () => v2Get<DashboardOverview>("/dashboard/overview"));
const fetchScada = () =>
  cached("scada-rc", () => v2Get<ScadaSummary>("/scada-realtime/summary?type=RC"));

async function fetchOopGardu(limit = 12): Promise<ScadaGarduRow[]> {
  return cached(`oop-${limit}`, async () => {
    const res = await apiClient.get<ApiResponse<ScadaGarduRow[]>>(
      `/v1/scada-realtime/gardu?type=RC&status=OOP&page=1&limit=${limit}`,
    );
    return res.data.data ?? [];
  });
}

async function fetchInScanGardu(limit = 12): Promise<ScadaGarduRow[]> {
  return cached(`inscan-${limit}`, async () => {
    const res = await apiClient.get<ApiResponse<ScadaGarduRow[]>>(
      `/v1/scada-realtime/gardu?type=RC&status=IN_SCAN&page=1&limit=${limit}`,
    );
    return res.data.data ?? [];
  });
}

/** Resolve a free-text query to a single gardu (whole-DB search). 404 → null. */
async function searchGardu(q: string): Promise<AiSearchResult | null> {
  try {
    return await v2Get<AiSearchResult>("/ai/assets/search", { params: { q } });
  } catch {
    return null;
  }
}

const pct = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);

// ── Intent router ─────────────────────────────────────────────────────────────
/**
 * Natural-language → structured Answer, backed by live backend data.
 * Intents are checked most-specific first; the final branch is a whole-DB gardu
 * lookup so any "<code>/<name>" or "lokasi gardu X" resolves against the DB.
 */
export async function answerQuery(raw: string): Promise<Answer> {
  const q = raw.toLowerCase().trim();
  const has = (...kw: string[]) => kw.some((k) => q.includes(k));

  // 0) Greeting / capability discovery / smalltalk ─────────────────────────
  if (
    has(
      "halo",
      "hai",
      "hello",
      "hi",
      "help",
      "bantuan",
      "bisa apa",
      "apa saja",
      "fungsi",
      "cara pakai",
      "siapa",
      "kamu",
      "pagi",
      "siang",
      "sore",
      "malam",
      "assalamualaikum",
    )
  ) {
    return {
      text:
        "Halo! Saya adalah AI Assistant VoltHub, asisten cerdas untuk memantau gardu, status telekontrol SCADA, dan kondisi aset telekomunikasi secara realtime.\n\n" +
        "Saya dapat membantu Anda untuk mencari informasi berikut:\n" +
        "• **Ringkasan Jaringan**: coba ketik \"ringkasan kondisi jaringan\"\n" +
        "• **Status Telekontrol**: coba ketik \"berapa gardu inscan saat ini\" atau \"gardu RC OOP\"\n" +
        "• **Aset Bermasalah/Kritis**: coba ketik \"aset kritis\" atau \"aset rusak\"\n" +
        "• **Riwayat Inspeksi**: coba ketik \"cek data riwayat inspeksi\"\n" +
        "• **Riwayat Pemeliharaan**: coba ketik \"data riwayat HAR\"\n" +
        "• **Detail Gardu Spesifik**: coba ketik langsung kode gardunya (misalnya: \"PM46\")\n\n" +
        "Ada yang bisa saya bantu hari ini?",
    };
  }

  // 1) Network summary / overview ───────────────────────────────────────────
  if (
    has(
      "ringkas",
      "overview",
      "rangkum",
      "kondisi jaringan",
      "status jaringan",
      "kesehatan",
      "secara keseluruhan",
      "kesimpulan",
      "dashboard",
    )
  ) {
    const [o, s] = await Promise.all([fetchOverview(), fetchScada().catch(() => null)]);
    const stats: AnswerStat[] = [
      { label: "Total Gardu", value: o.counts.gardu.toLocaleString("id-ID") },
      { label: "Total Penyulang", value: o.counts.penyulang.toLocaleString("id-ID") },
      { label: "Total Aset", value: o.counts.asset.toLocaleString("id-ID") },
      {
        label: "Aset Kritis",
        value: o.criticalAssets.total,
        tone: o.criticalAssets.total ? "warn" : "good",
      },
      {
        label: "Tiket Terbuka",
        value: o.counts.ticketOpen,
        tone: o.counts.ticketOpen ? "warn" : "good",
      },
      { label: "Dokumen", value: o.counts.document.toLocaleString("id-ID") },
    ];
    if (s) {
      stats.push(
        { label: "RC In-Scan", value: s.inScan.toLocaleString("id-ID"), tone: "good" },
        { label: "RC OOP", value: s.oop.toLocaleString("id-ID"), tone: s.oop ? "bad" : "good" },
        { label: "%AVA Rata-rata", value: pct(s.avaAvg), tone: "default" },
      );
    }
    return {
      text:
        `Ringkasan kondisi jaringan (data langsung dari database). ` +
        (s
          ? `${s.oop.toLocaleString("id-ID")} dari ${s.total.toLocaleString("id-ID")} gardu RC berstatus OOP. `
          : "") +
        `${o.criticalAssets.total} aset berstatus kritis.`,
      stats,
    };
  }

  // 2) RC OOP / IN-SCAN / availability ──────────────────────────────────────
  if (
    has("oop", "in-scan", "inscan", "inscane", "in scan", "telekontrol", "availability", "ava", "scada") ||
    (has("rc") && has("cari", "gangguan", "putus", "masalah", "bermasalah", "status"))
  ) {
    const isSearchingInscan = has("in-scan", "inscan", "inscane", "in scan") && !has("oop");
    const [s, gardus] = await Promise.all([
      fetchScada(),
      isSearchingInscan ? fetchInScanGardu() : fetchOopGardu(),
    ]);

    if (isSearchingInscan) {
      return {
        text:
          s.inScan === s.total
            ? `Seluruh ${s.total.toLocaleString("id-ID")} gardu RC berstatus IN-SCAN — telekontrol terpantau normal (%AVA rata-rata ${pct(s.avaAvg)}).`
            : `${s.inScan.toLocaleString("id-ID")} dari ${s.total.toLocaleString("id-ID")} gardu RC berstatus IN-SCAN (telekontrol terpantau sehat/normal). %AVA rata-rata ${pct(s.avaAvg)}. Contoh gardu IN-SCAN:`,
        stats: [
          { label: "RC In-Scan", value: s.inScan.toLocaleString("id-ID"), tone: "good" },
          { label: "RC OOP", value: s.oop.toLocaleString("id-ID"), tone: s.oop ? "bad" : "good" },
          { label: "Belum ada data", value: s.unknown.toLocaleString("id-ID") },
          { label: "%AVA Rata-rata", value: pct(s.avaAvg) },
        ],
        items: gardus.map((g) => ({
          icon: RadioTower,
          title: g.code,
          subtitle: [g.up3, g.rtupp].filter(Boolean).join(" · ") || undefined,
          badge: (
            <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
              IN-SCAN
            </span>
          ),
        })),
      };
    }

    return {
      text:
        s.oop === 0
          ? `Seluruh ${s.total.toLocaleString("id-ID")} gardu RC berstatus IN-SCAN — telekontrol normal (%AVA rata-rata ${pct(s.avaAvg)}).`
          : `${s.oop.toLocaleString("id-ID")} dari ${s.total.toLocaleString("id-ID")} gardu RC berstatus OOP (telekontrol terputus). %AVA rata-rata ${pct(s.avaAvg)}. Contoh gardu OOP:`,
      stats: [
        { label: "RC In-Scan", value: s.inScan.toLocaleString("id-ID"), tone: "good" },
        { label: "RC OOP", value: s.oop.toLocaleString("id-ID"), tone: s.oop ? "bad" : "good" },
        { label: "Belum ada data", value: s.unknown.toLocaleString("id-ID") },
        { label: "%AVA Rata-rata", value: pct(s.avaAvg) },
      ],
      items: gardus.map((g) => ({
        icon: RadioTower,
        title: g.code,
        subtitle: [g.up3, g.rtupp].filter(Boolean).join(" · ") || undefined,
        badge: (
          <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-400">
            OOP
          </span>
        ),
      })),
    };
  }

  // 3) Critical assets — WARNING/DAMAGED, optionally scoped to a type ────────
  if (
    has(
      "kritis",
      "rusak",
      "perlu diganti",
      "perlu perhatian",
      "bermasalah",
      "prioritas",
      "warning",
      "damaged",
      "kondisi aset",
      "aset bermasalah",
    )
  ) {
    const o = await fetchOverview();
    const typeHit = ASSET_TYPE_KEYWORDS.find(([re]) => re.test(q))?.[1];
    let items = o.criticalAssets.items;
    if (typeHit) items = items.filter((a) => a.assetType === typeHit);
    const label = typeHit ? ASSET_TYPE_LABELS[typeHit] : "aset";
    return {
      text:
        o.criticalAssets.total === 0
          ? `Tidak ada ${label} berstatus WARNING atau DAMAGED. Kondisi jaringan sehat.`
          : `Terdapat ${o.criticalAssets.total} ${label} kritis (WARNING/DAMAGED) di seluruh jaringan${typeHit ? "" : ". Yang terbaru diperbarui"}:`,
      stats: [{ label: "Total Aset Kritis", value: o.criticalAssets.total, tone: "warn" }],
      items: items.slice(0, 10).map((a) => ({
        to: `/asset/${a.id}`,
        icon: assetIcon(a.assetType),
        title: a.assetName,
        subtitle: [ASSET_TYPE_LABELS[a.assetType] ?? a.assetType, a.locationName]
          .filter(Boolean)
          .join(" · "),
        badge: <AssetStatusBadge status={a.status} />,
      })),
    };
  }

  // 4) Asset counts ("berapa rtu", "jumlah modem", breakdown) ───────────────
  if (
    (has("berapa", "jumlah", "hitung", "total", "daftar", "list", "tampilkan", "cek") &&
      (has("aset", "asset", "perangkat", "gardu", "penyulang") ||
        ASSET_TYPE_KEYWORDS.some(([re]) => re.test(q))))
  ) {
    const o = await fetchOverview();
    const typeHit = ASSET_TYPE_KEYWORDS.find(([re]) => re.test(q))?.[1];
    if (typeHit) {
      const n = o.assetByType[typeHit] ?? 0;
      return {
        text: `Terdaftar ${n.toLocaleString("id-ID")} unit ${ASSET_TYPE_LABELS[typeHit]} di seluruh jaringan.`,
        stats: [{ label: ASSET_TYPE_LABELS[typeHit], value: n.toLocaleString("id-ID") }],
      };
    }
    if (has("gardu")) {
      return {
        text: `Terdaftar ${o.counts.gardu.toLocaleString("id-ID")} gardu dan ${o.counts.penyulang.toLocaleString("id-ID")} penyulang di jaringan.`,
        stats: [
          { label: "Total Gardu", value: o.counts.gardu.toLocaleString("id-ID") },
          { label: "Total Penyulang", value: o.counts.penyulang.toLocaleString("id-ID") },
        ],
      };
    }
    const counts = Object.keys(ASSET_TYPE_LABELS)
      .map((t) => ({ label: ASSET_TYPE_LABELS[t], value: o.assetByType[t] ?? 0 }))
      .filter((c) => Number(c.value) > 0);
    return {
      text: `Total ${o.counts.asset.toLocaleString("id-ID")} aset terdaftar, dengan rincian per jenis:`,
      stats: [{ label: "Total Aset", value: o.counts.asset.toLocaleString("id-ID") }, ...counts],
    };
  }

  // 5) Tickets / work orders ────────────────────────────────────────────────
  if (has("tiket", "ticket", "work order", "wo ", "pekerjaan", "gangguan") && !has("inspeksi", "inspection", "har", "pemeliharaan")) {
    const o = await fetchOverview();
    const t = o.ticketByStatus;
    return {
      text: `Saat ini ada ${o.counts.ticketOpen} tiket terbuka and ${o.counts.ticketClosed} tiket selesai.`,
      stats: [
        { label: "Open", value: t.OPEN ?? 0, tone: "warn" },
        { label: "Assigned", value: t.ASSIGNED ?? 0 },
        { label: "In Progress", value: t.IN_PROGRESS ?? 0, tone: "warn" },
        { label: "Resolved", value: t.RESOLVED ?? 0, tone: "good" },
        { label: "Closed", value: t.CLOSED ?? 0, tone: "good" },
      ],
    };
  }

  // 5.1) Inspeksi / pemeriksaan / inspection ────────────────────────────────
  if (has("inspeksi", "inspection", "pemeriksaan") || (has("cek") && has("inspeksi", "inspection"))) {
    const o = await fetchOverview();
    return {
      text: `Ditemukan total ${o.counts.inspection.toLocaleString("id-ID")} inspeksi terdaftar (${o.monthly.inspectionThisMonth} bulan ini). Berikut beberapa inspeksi terbaru:`,
      stats: [
        { label: "Total Inspeksi", value: o.counts.inspection.toLocaleString("id-ID") },
        { label: "Inspeksi Bulan Ini", value: o.monthly.inspectionThisMonth.toLocaleString("id-ID"), tone: "good" },
      ],
      items: o.recentInspections.slice(0, 10).map((i) => ({
        to: `/inspection/${i.id}`,
        icon: Building2,
        title: `Inspeksi Gardu ${i.locationCode ?? "-"}`,
        subtitle: new Date(i.inspectionDate).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }),
        badge: (
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
            {i.findings} Temuan
          </span>
        ),
      })),
    };
  }

  // 5.2) HAR / Pemeliharaan / Maintenance ────────────────────────────────────
  if (has("har", "pemeliharaan", "maintenance")) {
    const o = await fetchOverview();
    return {
      text: `Ditemukan total ${o.counts.har.toLocaleString("id-ID")} pekerjaan HAR/pemeliharaan terdaftar (${o.monthly.harThisMonth} bulan ini). Berikut pekerjaan HAR terbaru:`,
      stats: [
        { label: "Total HAR", value: o.counts.har.toLocaleString("id-ID") },
        { label: "HAR Bulan Ini", value: o.monthly.harThisMonth.toLocaleString("id-ID"), tone: "good" },
      ],
      items: o.recentHar.slice(0, 10).map((h) => ({
        to: `/har/${h.id}`,
        icon: Boxes,
        title: `Pekerjaan HAR Gardu ${h.locationCode ?? "-"}`,
        subtitle: new Date(h.reportDate).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }),
        badge: (
          <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-400">
            {h.details} Aset
          </span>
        ),
      })),
    };
  }

  // 6) Whole-DB gardu lookup (code / name) ──────────────────────────────────
  const cleaned = raw
    .replace(
      /\b(lokasi|gardu|cari|tampilkan|dimana|di mana|info|informasi|detail|tentang|status|cek|carikan)\b/gi,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
  const term = cleaned.length >= 2 ? cleaned : raw.trim();
  if (term.length >= 2) {
    const r = await searchGardu(term);
    if (r) {
      const insp = r.lastInspection?.inspectionDate
        ? new Date(r.lastInspection.inspectionDate).toLocaleDateString("id-ID", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
        : null;
      const items: AnswerItem[] = [
        {
          to: `/gardu/${r.location.id}`,
          icon: Building2,
          title: locationLabel(r.location.code, r.location.name),
          subtitle:
            [r.location.locationType, r.location.up3 ? `UP3 ${r.location.up3}` : null]
              .filter(Boolean)
              .join(" · ") || undefined,
          badge: (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {r.assetCount} aset
            </span>
          ),
        },
        ...r.assets.slice(0, 6).map((a) => ({
          to: `/asset/${a.id}`,
          icon: assetIcon(a.assetType),
          title: a.assetName,
          subtitle: ASSET_TYPE_LABELS[a.assetType] ?? a.assetType,
          badge: a.status ? <AssetStatusBadge status={a.status as never} /> : undefined,
        })),
      ];
      return {
        text:
          `${locationLabel(r.location.code, r.location.name)}${r.location.up3 ? ` (UP3 ${r.location.up3})` : ""} — ` +
          `${r.assetCount} aset terpasang, ${r.communicationMedia.length} media komunikasi, ${r.documentCount} dokumen` +
          (insp ? `. Inspeksi terakhir ${insp}.` : "."),
        items,
      };
    }
    return {
      text: `Tidak ada gardu yang cocok dengan "${term}" di database. Coba kode atau nama gardu yang lain, atau minta "ringkasan jaringan".`,
    };
  }

  // 7) Fallback ─────────────────────────────────────────────────────────────
  return {
    text: 'Coba tanyakan: "ringkasan jaringan", "gardu RC OOP", "aset rusak", "berapa RTU", atau ketik kode/nama gardu (mis. "PM46").',
  };
}

export const SEED_PROMPTS = [
  "Ringkasan kondisi jaringan",
  "Cari gardu RC OOP",
  "Aset rusak yang perlu diganti",
  "Berapa RTU terpasang",
];

export const STAT_TONE_CLASS: Record<NonNullable<AnswerStat["tone"]>, string> = {
  default: "text-foreground",
  good: "text-green-600 dark:text-green-400",
  warn: "text-amber-600 dark:text-amber-400",
  bad: "text-red-600 dark:text-red-400",
};
