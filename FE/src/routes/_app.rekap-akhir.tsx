/**
 * Monitoring Laporan Akhir — Spreadsheet / Data Grid View
 *
 * Konsep: "Excel Online yang tersimpan di database"
 * - Summary cards: Total, Approved, Pending, Revision
 * - Sticky: No, Report ID, Petugas
 * - Column visibility toggle → localStorage + drives export
 * - Sort: klik header kolom → sort asc/desc via backend
 * - Filter: Search, Petugas, Status, RTUPP, Date range
 * - Export: template Standard / Teknikal / Lengkap / View Saat Ini
 * - Row click → detail laporan akhir
 */

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { StatusBadge } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  Loader2,
  FileX,
  Building2,
  Columns3,
  User,
  Paperclip,
  TableProperties,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ExternalLink,
  CalendarCheck,
  CalendarRange,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { requireRole } from "@/lib/route-guards";
import {
  getRekap,
  exportRekap,
  getCellValue,
  COLUMN_DEFS,
  EXPORT_TEMPLATES,
  type RekapAkhirParams,
  type RekapAkhirItem,
  type RekapAkhirSummary,
} from "@/lib/api/rekapAkhir";
import { getRtuppList, type Rtupp } from "@/lib/api/users";
import { showError } from "@/lib/swal";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/rekap-akhir")({
  beforeLoad: () => {
    requireRole(["admin", "superadmin"]);
  },
  component: MonitoringPage,
  head: () => ({ meta: [{ title: "Monitoring Laporan Akhir — VoltHub" }] }),
});

// ─── Column layout ────────────────────────────────────────────────────────────
//
// STICKY (always visible, fixed left, not toggleable):
//   [No] [Report ID] [Petugas]
//
// SCROLLABLE (can be hidden via Column Visibility toggle):
//   everything else, in logical group order

const STICKY_KEYS = ["reportId", "petugas"] as const;

// Left offset (px) for each sticky column:
//   No col = 0..44px, reportId = 44..174px, petugas = 174px+
const STICKY_LEFT: Record<string, number> = { reportId: 44, petugas: 174 };

// Scrollable columns — diurutkan kontigu per grup (Identitas → Lokasi → Perangkat →
// Jaringan → Status → Hasil → Audit) supaya header grup bisa di-merge (colSpan).
const SCROLLABLE_KEYS = [
  // Identitas
  "laporanAwalId",
  "nomorSPJ",
  "tanggalSelesai",
  // Lokasi
  "rtuppNama",
  "rtuppKode",
  "teamNama",
  "up3",
  "gardu",
  "jenisPekerjaan",
  "bayPosisi",
  // Perangkat
  "rtu",
  "media",
  "rectifier",
  "baterai",
  "tagSCADA",
  "teganganNominal",
  "catatanRTU",
  "catatanMedia",
  "catatanRectifier",
  "catatanBaterai",
  "catatanLain",
  "catatanTambahan",
  // Jaringan
  "asdu",
  "ipModem",
  "ipRTU",
  "ipSIM1",
  "ipSIM2",
  "ipGTWIconPlus",
  "ipWAN",
  // Status
  "statusSebelum",
  "statusSesudah",
  "statusPekerjaan",
  "status",
  // Hasil
  "detailLangkah",
  "hasilPekerjaan",
  "hasilTahananIsolasi",
  "hasilPengukuranBeban",
  "durasiPekerjaan",
  "pengawas",
  "pelaksana",
  // Audit
  "tanggalDibuat",
  "submittedAt",
  "approvedAt",
  "rejectedAt",
  "approvedBy",
  "rejectedBy",
  "jumlahLampiran",
] as const;

// Column def lookup
const COL_BY_KEY = Object.fromEntries(COLUMN_DEFS.map((c) => [c.key, c]));
const stickyColDefs = (STICKY_KEYS as readonly string[]).map((k) => COL_BY_KEY[k]).filter(Boolean);

// Columns that can be sorted via backend
const SORTABLE_KEYS = new Set([
  "reportId",
  "nomorSPJ",
  "tanggalSelesai",
  "tanggalDibuat",
  "submittedAt",
  "approvedAt",
  "up3",
  "gardu",
  "status",
]);

// localStorage key for column preferences.
// v2: default kolom dirombak untuk monitoring harian (RTUPP/Team/Status), grup disederhanakan.
const LS_COLS_KEY = "voltreport:rekap-akhir:visible-cols:v2";

// Default visible: only defaultOn=true columns
const DEFAULT_VISIBLE = new Set(
  (SCROLLABLE_KEYS as readonly string[]).filter((k) => COL_BY_KEY[k]?.defaultOn !== false),
);

// ─── Color maps ───────────────────────────────────────────────────────────────

const CATATAN_CLR: Record<string, string> = {
  NORMAL:
    "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-400 dark:border-green-800",
  RUSAK:
    "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800",
  HATI_HATI:
    "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-400 dark:border-yellow-800",
};

const GARDU_CLR: Record<string, string> = {
  APPDISK:
    "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-400 dark:border-green-800",
  INSCAN:
    "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800",
  BERHASIL_RC:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
  GAGAL_RC:
    "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800",
  OOP: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-800",
  LAIN_LAIN: "bg-muted text-muted-foreground border-border",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readSavedCols(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_COLS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) return new Set(parsed as string[]);
    }
  } catch {
    // ignore corrupt localStorage, fall back to defaults
  }
  return DEFAULT_VISIBLE;
}

function saveCols(cols: Set<string>) {
  try {
    localStorage.setItem(LS_COLS_KEY, JSON.stringify([...cols]));
  } catch {
    // ignore quota/serialization errors
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EnumPill({ v, map }: { v: string; map: Record<string, string> }) {
  if (!v || v === "-") return <span className="text-muted-foreground">—</span>;
  return (
    <span
      className={cn(
        "inline-block px-1.5 py-0.5 rounded border text-[10px] font-semibold whitespace-nowrap leading-tight",
        map[v] ?? "bg-muted text-muted-foreground border-border",
      )}
    >
      {v.replace(/_/g, " ")}
    </span>
  );
}

function Cell({ row, colKey }: { row: RekapAkhirItem; colKey: string }) {
  if (colKey === "status") return <StatusBadge status={row.status as any} />;

  if (["catatanRTU", "catatanMedia", "catatanRectifier", "catatanBaterai"].includes(colKey))
    return <EnumPill v={getCellValue(row, colKey)} map={CATATAN_CLR} />;

  if (["statusSebelum", "statusSesudah"].includes(colKey))
    return <EnumPill v={getCellValue(row, colKey)} map={GARDU_CLR} />;

  if (colKey === "jumlahLampiran") {
    const n = row._count?.attachments ?? 0;
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1",
          n > 0 ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground",
        )}
      >
        <Paperclip className="size-3" />
        {n}
      </span>
    );
  }

  const v = getCellValue(row, colKey);
  if (!v || v === "-") return <span className="text-muted-foreground select-all">—</span>;

  if (colKey === "reportId" || colKey === "laporanAwalId")
    return <span className="font-mono text-[11px] select-all">{v}</span>;

  const isLong = [
    "detailLangkah",
    "hasilPekerjaan",
    "catatanLain",
    "catatanTambahan",
    "jenisPekerjaan",
    "rtu",
    "media",
    "rectifier",
    "baterai",
  ].includes(colKey);
  return (
    <span
      className={cn("select-all", isLong && "block max-w-50 truncate")}
      title={isLong ? v : undefined}
    >
      {v}
    </span>
  );
}

// Sort indicator on clickable column headers
function SortHeader({
  colKey,
  sortKey,
  sortDir,
  onSort,
  children,
  className,
}: {
  colKey: string;
  sortKey: string;
  sortDir: "asc" | "desc";
  onSort: (key: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  if (!SORTABLE_KEYS.has(colKey)) return <span className={className}>{children}</span>;
  const isActive = sortKey === colKey;
  return (
    <button
      onClick={() => onSort(colKey)}
      className={cn(
        "flex items-center gap-1 group hover:text-foreground transition-colors",
        className,
      )}
    >
      {children}
      {isActive ? (
        sortDir === "asc" ? (
          <ArrowUp className="size-3 text-primary" />
        ) : (
          <ArrowDown className="size-3 text-primary" />
        )
      ) : (
        <ArrowUpDown className="size-3 opacity-30 group-hover:opacity-70 transition-opacity" />
      )}
    </button>
  );
}

// Summary card
function SummaryCard({
  label,
  value,
  icon: Icon,
  colorBg,
  colorText,
  colorBorder,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  colorBg: string;
  colorText: string;
  colorBorder: string;
}) {
  // Fallback aman: response backend lama bisa belum punya field baru (approvedToday/Month) → undefined
  const safeValue = value ?? 0;
  return (
    <div
      className={cn("flex items-center gap-3 px-4 py-3 rounded-xl border", colorBg, colorBorder)}
    >
      <div className={cn("p-2 rounded-lg", colorBg)}>
        <Icon className={cn("size-4 shrink-0", colorText)} />
      </div>
      <div className="min-w-0">
        <div className={cn("text-2xl font-bold tabular-nums leading-none", colorText)}>
          {safeValue.toLocaleString("id-ID")}
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{label}</div>
      </div>
    </div>
  );
}

// Column visibility panel
function ColumnVisibilityPanel({
  visible,
  onChange,
}: {
  visible: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, typeof COLUMN_DEFS>();
    (SCROLLABLE_KEYS as readonly string[]).forEach((key) => {
      const col = COL_BY_KEY[key];
      if (!col) return;
      if (!map.has(col.group)) map.set(col.group, []);
      map.get(col.group)!.push(col);
    });
    return map;
  }, []);

  const toggle = (key: string) => {
    const next = new Set(visible);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(next);
  };

  const showAll = () => onChange(new Set(SCROLLABLE_KEYS as readonly string[]));
  const hideAll = () => onChange(new Set());

  const hiddenCount = SCROLLABLE_KEYS.length - visible.size;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-lg gap-1.5 h-8">
          <Columns3 className="size-3.5" />
          Kolom
          {hiddenCount > 0 && (
            <Badge variant="secondary" className="h-4 px-1 text-[10px] ml-0.5">
              {hiddenCount} hidden
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-95 p-0" align="end" side="bottom">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/40">
          <span className="text-xs font-semibold">Tampilan Kolom</span>
          <div className="flex gap-1.5">
            <button onClick={showAll} className="text-[10px] text-primary hover:underline">
              Tampilkan semua
            </button>
            <span className="text-muted-foreground text-[10px]">·</span>
            <button onClick={hideAll} className="text-[10px] text-muted-foreground hover:underline">
              Sembunyikan semua
            </button>
          </div>
        </div>

        {/* Sticky cols info */}
        <div className="px-3 py-2 border-b border-border/60 bg-muted/20">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-1">
            Selalu tampil (frozen)
          </p>
          <div className="flex gap-2">
            {[{ key: "no", label: "No" }, ...stickyColDefs].map((c) => (
              <span
                key={c.key}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-primary/10 text-primary border border-primary/20 font-medium"
              >
                🔒 {c.label}
              </span>
            ))}
          </div>
        </div>

        {/* Scrollable cols by group */}
        <div className="max-h-100 overflow-y-auto p-3 space-y-3">
          {Array.from(groups.entries()).map(([group, cols]) => (
            <div key={group}>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
                {group}
              </p>
              <div className="grid grid-cols-2 gap-0.5">
                {cols.map((col) => (
                  <label
                    key={col.key}
                    className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-muted/60 cursor-pointer select-none transition-colors"
                  >
                    <Checkbox
                      checked={visible.has(col.key)}
                      onCheckedChange={() => toggle(col.key)}
                      className="h-3.5 w-3.5"
                    />
                    <span className="text-xs leading-tight">{col.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="px-3 py-2 border-t border-border/60 bg-muted/20">
          <p className="text-[10px] text-muted-foreground">
            <span className="font-semibold text-foreground">
              {visible.size + STICKY_KEYS.length + 1}
            </span>{" "}
            dari {SCROLLABLE_KEYS.length + STICKY_KEYS.length + 1} kolom ditampilkan
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

const PER_PAGE = 25;

const EMPTY_SUMMARY: RekapAkhirSummary = {
  total: 0,
  approved: 0,
  pending: 0,
  rejected: 0,
  draft: 0,
  approvedToday: 0,
  approvedThisMonth: 0,
};

function MonitoringPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const isSuperAdmin = user?.role === "superadmin";
  const isAdminRtupp = user?.role === "admin";

  // ── Filter state
  const [search, setSearch] = useState("");
  const [petugas, setPetugas] = useState("");
  const [status, setStatus] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [rtuppId, setRtuppId] = useState("all");
  const [page, setPage] = useState(1);

  // ── Sort state
  const [sortKey, setSortKey] = useState("tanggalSelesai");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // ── Column visibility — persisted to localStorage
  const [visibleCols, setVisibleColsState] = useState<Set<string>>(readSavedCols);

  const setVisibleCols = (next: Set<string>) => {
    setVisibleColsState(next);
    saveCols(next);
  };

  const [exporting, setExporting] = useState(false);

  const resetPage = () => setPage(1);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    resetPage();
  };

  const { data: rtuppList = [] } = useQuery<Rtupp[]>({
    queryKey: ["rtupp-list"],
    queryFn: getRtuppList,
    enabled: isSuperAdmin,
  });

  const params: RekapAkhirParams = {
    status: status === "all" ? undefined : status.toUpperCase(),
    search: search || undefined,
    petugas: petugas || undefined,
    page,
    limit: PER_PAGE,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    rtuppId: isSuperAdmin && rtuppId !== "all" ? rtuppId : undefined,
    orderByField: sortKey,
    orderDir: sortDir,
  };

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["rekap-akhir", params],
    queryFn: () => getRekap(params),
    placeholderData: (prev) => prev,
  });

  const items: RekapAkhirItem[] = data?.items ?? [];
  const pagination = data?.pagination ?? { page: 1, limit: PER_PAGE, total: 0, totalPages: 1 };
  const summary: RekapAkhirSummary = data?.summary ?? EMPTY_SUMMARY;

  // Columns to render in the scrollable section
  const scrollableCols = useMemo(
    () =>
      (SCROLLABLE_KEYS as readonly string[])
        .filter((k) => visibleCols.has(k))
        .map((k) => COL_BY_KEY[k])
        .filter(Boolean),
    [visibleCols],
  );

  // Contiguous runs of same group → satu header grup di-merge (colSpan) supaya tidak berulang
  const groupRuns = useMemo(() => {
    const runs: { group: string; span: number }[] = [];
    for (const col of scrollableCols) {
      const last = runs[runs.length - 1];
      if (last && last.group === col.group) last.span += 1;
      else runs.push({ group: col.group, span: 1 });
    }
    return runs;
  }, [scrollableCols]);

  // ── Export
  const handleExport = async (template: "standard" | "teknikal" | "lengkap" | "current") => {
    setExporting(true);
    try {
      let exportCols: string[];
      if (template === "current") {
        exportCols = [
          ...(STICKY_KEYS as readonly string[]),
          ...(SCROLLABLE_KEYS as readonly string[]).filter((k) => visibleCols.has(k)),
        ];
      } else {
        exportCols = EXPORT_TEMPLATES[template]?.columns ?? [];
      }
      await exportRekap({ ...params, columns: exportCols.join(",") });
    } catch {
      showError("Gagal mengekspor data");
    } finally {
      setExporting(false);
    }
  };

  // ── Active filter count for reset badge
  const activeFilters = [
    search,
    petugas,
    status !== "all" ? status : "",
    startDate,
    endDate,
    isSuperAdmin && rtuppId !== "all" ? rtuppId : "",
  ].filter(Boolean).length;

  return (
    <div className="flex flex-col -mx-6 lg:-mx-8 -mb-6 lg:-mb-8">
      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-background shrink-0">
        <TableProperties className="size-4 text-primary shrink-0" />
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-sm">Monitoring Laporan Akhir</span>
          {isAdminRtupp && (
            <Badge variant="secondary" className="text-[10px] rounded-md">
              {user?.rtupp?.name ?? "RTUPP"}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1.5 ml-2 text-xs text-muted-foreground">
          <span className="tabular-nums font-medium text-foreground">{pagination.total}</span>
          <span>baris</span>
          {isFetching && <Loader2 className="size-3 animate-spin ml-1" />}
        </div>

        <div className="flex-1" />

        <ColumnVisibilityPanel visible={visibleCols} onChange={setVisibleCols} />

        {/* Export dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              className="h-8 rounded-lg gradient-pln text-white gap-1.5"
              disabled={exporting || isLoading}
            >
              {exporting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <FileSpreadsheet className="size-3.5" />
              )}
              Export
              <ChevronDown className="size-3 ml-0.5 opacity-80" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Template
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={() => handleExport("standard")}>
              <FileSpreadsheet className="size-3.5 mr-2 text-blue-500" />
              <div>
                <div className="text-sm font-medium">Standard</div>
                <div className="text-[10px] text-muted-foreground">
                  Identitas, petugas, lokasi, status
                </div>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport("teknikal")}>
              <FileSpreadsheet className="size-3.5 mr-2 text-purple-500" />
              <div>
                <div className="text-sm font-medium">Teknikal</div>
                <div className="text-[10px] text-muted-foreground">
                  + IP, aset SCADA, catatan perangkat
                </div>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport("lengkap")}>
              <FileSpreadsheet className="size-3.5 mr-2 text-green-500" />
              <div>
                <div className="text-sm font-medium">Lengkap</div>
                <div className="text-[10px] text-muted-foreground">Semua kolom yang tersedia</div>
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => handleExport("current")}>
              <Columns3 className="size-3.5 mr-2 text-muted-foreground" />
              <div>
                <div className="text-sm font-medium">View Saat Ini</div>
                <div className="text-[10px] text-muted-foreground">
                  Hanya kolom yang ditampilkan
                </div>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* ── Summary Cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 px-4 py-3 border-b border-border bg-muted/10 shrink-0">
        <SummaryCard
          label="Total Laporan"
          value={summary.total}
          icon={TableProperties}
          colorBg="bg-blue-50 dark:bg-blue-950/30"
          colorText="text-blue-600 dark:text-blue-400"
          colorBorder="border-blue-200 dark:border-blue-800"
        />
        <SummaryCard
          label="Approved"
          value={summary.approved}
          icon={CheckCircle2}
          colorBg="bg-green-50 dark:bg-green-950/30"
          colorText="text-green-600 dark:text-green-400"
          colorBorder="border-green-200 dark:border-green-800"
        />
        <SummaryCard
          label="Pending"
          value={summary.pending}
          icon={Clock}
          colorBg="bg-yellow-50 dark:bg-yellow-950/30"
          colorText="text-yellow-600 dark:text-yellow-400"
          colorBorder="border-yellow-200 dark:border-yellow-800"
        />
        <SummaryCard
          label="Revision / Rejected"
          value={summary.rejected}
          icon={AlertTriangle}
          colorBg="bg-red-50 dark:bg-red-950/30"
          colorText="text-red-600 dark:text-red-400"
          colorBorder="border-red-200 dark:border-red-800"
        />
        <SummaryCard
          label="Approved Hari Ini"
          value={summary.approvedToday}
          icon={CalendarCheck}
          colorBg="bg-emerald-50 dark:bg-emerald-950/30"
          colorText="text-emerald-600 dark:text-emerald-400"
          colorBorder="border-emerald-200 dark:border-emerald-800"
        />
        <SummaryCard
          label="Approved Bulan Ini"
          value={summary.approvedThisMonth}
          icon={CalendarRange}
          colorBg="bg-teal-50 dark:bg-teal-950/30"
          colorText="text-teal-600 dark:text-teal-400"
          colorBorder="border-teal-200 dark:border-teal-800"
        />
      </div>

      {/* ── Filter Bar ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-border bg-muted/20 shrink-0">
        {/* Search */}
        <div className="relative">
          <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Report ID, SPJ, gardu, pekerjaan..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetPage();
            }}
            className="pl-8 h-8 w-64 text-xs rounded-lg"
          />
        </div>

        {/* Petugas filter */}
        <div className="relative">
          <User className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Nama petugas..."
            value={petugas}
            onChange={(e) => {
              setPetugas(e.target.value);
              resetPage();
            }}
            className="pl-8 h-8 w-44 text-xs rounded-lg"
          />
        </div>

        {/* Status */}
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            resetPage();
          }}
        >
          <SelectTrigger className="h-8 w-36 text-xs rounded-lg">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua Status</SelectItem>
            <SelectItem value="approved">✅ Approved</SelectItem>
            <SelectItem value="pending">🕐 Pending</SelectItem>
            <SelectItem value="rejected">❌ Rejected</SelectItem>
            <SelectItem value="draft">📝 Draft</SelectItem>
          </SelectContent>
        </Select>

        {/* RTUPP — superadmin only */}
        {isSuperAdmin && (
          <Select
            value={rtuppId}
            onValueChange={(v) => {
              setRtuppId(v);
              resetPage();
            }}
          >
            <SelectTrigger className="h-8 w-44 text-xs rounded-lg">
              <Building2 className="size-3 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="RTUPP" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua RTUPP</SelectItem>
              {rtuppList.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Date range */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground">Dari</span>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              resetPage();
            }}
            className="h-8 w-36 text-xs rounded-lg"
          />
          <span className="text-[10px] text-muted-foreground">s.d.</span>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              resetPage();
            }}
            className="h-8 w-36 text-xs rounded-lg"
          />
        </div>

        {/* Reset filters */}
        {activeFilters > 0 && (
          <button
            onClick={() => {
              setSearch("");
              setPetugas("");
              setStatus("all");
              setStartDate("");
              setEndDate("");
              setRtuppId("all");
              resetPage();
            }}
            className="text-[10px] text-muted-foreground hover:text-destructive underline ml-1 transition-colors"
          >
            Reset filter ({activeFilters})
          </button>
        )}
      </div>

      {/* ── Data Grid ────────────────────────────────────────────────── */}
      <div
        className="overflow-auto flex-1"
        style={{ height: "calc(100vh - 340px)", minHeight: "320px" }}
      >
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="size-8 animate-spin" />
              <span className="text-sm">Memuat data...</span>
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3 text-center">
              <FileX className="size-10 text-muted-foreground" />
              <div>
                <div className="text-sm font-medium">Tidak ada data</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Coba ubah filter pencarian
                </div>
              </div>
            </div>
          </div>
        ) : (
          <table className="w-max border-collapse text-[11px]">
            {/* ─ Header ─ */}
            <thead className="sticky top-0 z-30">
              {/* Row 1: Group labels */}
              <tr className="bg-slate-100 dark:bg-slate-800 border-b border-border/60">
                {/* No */}
                <th className="sticky left-0 z-40 bg-slate-100 dark:bg-slate-800 border-r border-border/50 px-2 py-1 text-center w-11 min-w-11" />
                {/* Report ID — sticky */}
                <th
                  className="sticky z-40 bg-slate-100 dark:bg-slate-800 border-r border-border/50 px-2 py-1 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground text-center"
                  style={{ left: STICKY_LEFT.reportId, minWidth: COL_BY_KEY["reportId"]?.width }}
                >
                  Identitas
                </th>
                {/* Petugas — sticky */}
                <th
                  className="sticky z-40 bg-slate-100 dark:bg-slate-800 border-r border-border/60 px-2 py-1 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground text-center"
                  style={{ left: STICKY_LEFT.petugas, minWidth: COL_BY_KEY["petugas"]?.width }}
                >
                  Petugas
                </th>
                {/* Scrollable groups — merged per contiguous run */}
                {groupRuns.map((run, i) => (
                  <th
                    key={`${run.group}-${i}`}
                    colSpan={run.span}
                    className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-primary/80 text-center border-r-2 border-border/50 last:border-0 whitespace-nowrap bg-slate-100 dark:bg-slate-800"
                  >
                    {run.group}
                  </th>
                ))}
              </tr>

              {/* Row 2: Column labels */}
              <tr className="bg-slate-50 dark:bg-slate-900 border-b-2 border-border">
                {/* No */}
                <th className="sticky left-0 z-40 bg-slate-50 dark:bg-slate-900 border-r border-border/50 px-2 py-2 text-center text-[10px] font-bold text-muted-foreground w-11 min-w-11">
                  No
                </th>
                {/* Report ID — sticky + sortable */}
                <th
                  className="sticky z-40 bg-slate-50 dark:bg-slate-900 border-r border-border/50 px-3 py-2 text-left text-[10px] font-bold whitespace-nowrap"
                  style={{ left: STICKY_LEFT.reportId, minWidth: COL_BY_KEY["reportId"]?.width }}
                >
                  <SortHeader
                    colKey="reportId"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSort={handleSort}
                  >
                    {COL_BY_KEY["reportId"]?.label}
                  </SortHeader>
                </th>
                {/* Petugas — sticky */}
                <th
                  className="sticky z-40 bg-slate-50 dark:bg-slate-900 border-r-2 border-border px-3 py-2 text-left text-[10px] font-bold whitespace-nowrap"
                  style={{ left: STICKY_LEFT.petugas, minWidth: COL_BY_KEY["petugas"]?.width }}
                >
                  {COL_BY_KEY["petugas"]?.label}
                </th>
                {/* Scrollable cols — sortable where supported */}
                {scrollableCols.map((col) => (
                  <th
                    key={col.key}
                    className="px-3 py-2 text-left text-[10px] font-bold whitespace-nowrap border-r border-border/30 last:border-0"
                    style={{ minWidth: col.width }}
                  >
                    <SortHeader
                      colKey={col.key}
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSort={handleSort}
                    >
                      {col.label}
                    </SortHeader>
                  </th>
                ))}
              </tr>
            </thead>

            {/* ─ Body ─ */}
            <tbody>
              {items.map((row, idx) => {
                // Zebra dibuat OPAQUE (tanpa /80 /60) supaya sticky cell yang mewarisinya
                // tidak tembus pandang saat horizontal scroll.
                const rowBg =
                  idx % 2 === 0 ? "bg-white dark:bg-background" : "bg-slate-50 dark:bg-slate-900";
                // Background khusus sticky cell: opaque penuh di base & hover (tidak pakai
                // tint translucent), agar konten kolom lain tidak menembus area sticky.
                const stickyBg =
                  idx % 2 === 0
                    ? "bg-white dark:bg-background group-hover:bg-slate-100 dark:group-hover:bg-slate-800"
                    : "bg-slate-50 dark:bg-slate-900 group-hover:bg-slate-100 dark:group-hover:bg-slate-800";

                return (
                  <tr
                    key={row.id}
                    onClick={() => navigate({ to: "/laporan-akhir/$id", params: { id: row.id } })}
                    className={cn(
                      "group border-b border-border/30 hover:bg-primary/5 dark:hover:bg-primary/10 transition-colors cursor-pointer",
                      rowBg,
                    )}
                  >
                    {/* No — sticky */}
                    <td
                      className={cn(
                        "sticky left-0 z-20 border-r border-border/40 px-2 py-1.5 text-center text-muted-foreground tabular-nums",
                        stickyBg,
                      )}
                    >
                      {(page - 1) * PER_PAGE + idx + 1}
                    </td>

                    {/* Report ID — sticky, shows link icon on hover */}
                    <td
                      className={cn("sticky z-20 border-r border-border/40 px-3 py-1.5", stickyBg)}
                      style={{ left: STICKY_LEFT.reportId }}
                    >
                      <span className="flex items-center gap-1.5">
                        <Cell row={row} colKey="reportId" />
                        <ExternalLink className="size-3 text-muted-foreground opacity-0 group-hover:opacity-60 transition-opacity shrink-0" />
                      </span>
                    </td>

                    {/* Petugas — sticky */}
                    <td
                      className={cn("sticky z-20 border-r-2 border-border px-3 py-1.5", stickyBg)}
                      style={{ left: STICKY_LEFT.petugas }}
                    >
                      <Cell row={row} colKey="petugas" />
                    </td>

                    {/* Scrollable cells */}
                    {scrollableCols.map((col) => (
                      <td
                        key={col.key}
                        className="px-3 py-1.5 border-r border-border/20 last:border-0 align-middle"
                      >
                        <Cell row={row} colKey={col.key} />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Status Bar (Excel-like) ───────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-muted/20 text-[11px] text-muted-foreground shrink-0">
        <div className="flex items-center gap-4">
          <span>
            Menampilkan baris{" "}
            <span className="font-semibold text-foreground tabular-nums">
              {pagination.total > 0 ? (page - 1) * PER_PAGE + 1 : 0}–
              {Math.min(page * PER_PAGE, pagination.total)}
            </span>{" "}
            dari{" "}
            <span className="font-semibold text-foreground tabular-nums">{pagination.total}</span>
          </span>
          <span className="text-border/80">|</span>
          <span>
            <span className="font-semibold text-foreground tabular-nums">
              {scrollableCols.length + STICKY_KEYS.length + 1}
            </span>{" "}
            kolom ditampilkan
          </span>
          {sortKey && (
            <>
              <span className="text-border/80">|</span>
              <span className="text-primary/80">
                Urut:{" "}
                <span className="font-medium text-foreground">
                  {COL_BY_KEY[sortKey]?.label ?? sortKey}
                </span>{" "}
                {sortDir === "asc" ? "↑" : "↓"}
              </span>
            </>
          )}
          {activeFilters > 0 && (
            <>
              <span className="text-border/80">|</span>
              <span className="text-primary font-medium">{activeFilters} filter aktif</span>
            </>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-2">
          <span className="tabular-nums">
            Hal <span className="font-semibold text-foreground">{pagination.page}</span> /{" "}
            {pagination.totalPages}
          </span>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7 w-7 p-0 rounded"
              aria-label="Halaman sebelumnya"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="size-3.5" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 w-7 p-0 rounded"
              aria-label="Halaman berikutnya"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
