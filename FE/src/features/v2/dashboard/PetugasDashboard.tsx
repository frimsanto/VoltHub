// VoltHub — PETUGAS dashboard (mobile-first, task-oriented).
//
// The first screen answers one question: "What should this field officer do
// today?" — so actionable content leads (priorities, today's tasks, quick
// create) and analytics are demoted to the bottom. Every number is real,
// sourced from the existing V1 dashboard endpoint (GET /api/dashboard/stats);
// there is no work-assignment API, so "today's work" is derived from real report
// state: drafts (unfinished), rejected/revised (needs fixing) and today's
// submissions. No new endpoints, no placeholder numbers.
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "motion/react";
import {
  CalendarDays,
  CheckCircle2,
  FileText,
  History,
  ArrowRight,
  ChevronRight,
  AlertTriangle,
  ListChecks,
  MapPin,
  ClipboardList,
  Sparkles,
  Wrench,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { CHART_COLORS } from "@/lib/chart-config";
import { PageHero } from "@/components/PageHero";
import { NotificationCenter } from "@/components/NotificationCenter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { resolveAvatarUrl } from "@/lib/api/auth";
import { ChatDrawer } from "@/features/v2/ai-assistant/ChatDrawer";
import { SectionCard, RecentList } from "./widgets";
import {
  DonutChart,
  DonutLegend,
  TrendChart,
  GaugeSemicircle,
  SparkArea,
  type Slice,
  type TrendPoint,
} from "./charts";
import { useDashboardStatsRaw, useDashboardActivity } from "./activity";
import { workOrders, useWorkOrderStats, type WorkOrder } from "@/features/v2/work-orders/resource";
import { WO_STATUS_LABELS, type WorkOrderStatus } from "@/lib/v2/enums";
import type { DashboardStats } from "@/lib/api/dashboard";

type RecentReport = DashboardStats["recentReports"][number];

// Warna status WO — dipakai hero card + list "WO Terbaru" (Screen 1 mobile).
const WO_MOBILE_COLOR: Record<WorkOrderStatus, string> = {
  DRAFT: "#94a3b8",
  ASSIGNED: "#3b82f6",
  ON_PROGRESS: "#f59e0b",
  WAITING_APPROVAL: "#8b5cf6",
  APPROVED: "#14b8a6",
  REJECTED: "#ef4444",
  CLOSED: "#22c55e",
};

// Warna dot status WO aktif (Opsi C): assigned=kuning, proses=oranye.
const WO_DOT: Record<string, string> = {
  ASSIGNED: CHART_COLORS.warning,
  ON_PROGRESS: CHART_COLORS.primary,
  WAITING_APPROVAL: CHART_COLORS.secondary,
};

// Badge singkat tipe laporan wajib WO (GI/GH/MP).
function reportTypeBadge(code: string): string {
  if (code.endsWith("_GH")) return "GH";
  if (code.endsWith("_MP")) return "MP";
  return "GI";
}

// Tugas Hari Ini — WO aktif milik petugas (list BE auto-scope untuk PETUGAS).
function TodayWorkOrders() {
  const { data, isLoading } = workOrders.useList({ page: 1, limit: 10, mine: true });
  const active = (data?.items ?? [])
    .filter((wo) => wo.status === "ASSIGNED" || wo.status === "ON_PROGRESS")
    .slice(0, 5);
  return (
    <SectionCard
      title="Tugas Hari Ini"
      icon={ListChecks}
      action={
        <Link to={"/work-order" as never} className="text-xs text-primary hover:underline">
          Lihat semua
        </Link>
      }
    >
      <RecentList
        items={active}
        isLoading={isLoading}
        empty="Tidak ada work order aktif untukmu 🎉"
        render={(wo) => (
          <div className="flex items-center gap-3">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: WO_DOT[wo.status] ?? CHART_COLORS.gray }}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{wo.title}</div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="size-3 shrink-0" />
                <span className="truncate">{wo.location?.name ?? wo.location?.code ?? "—"}</span>
              </div>
            </div>
            {(wo.requiredReports ?? []).map((r) => (
              <span
                key={r}
                className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary"
              >
                {reportTypeBadge(r)}
              </span>
            ))}
            <Link
              to={"/work-order/$id" as never}
              params={{ id: wo.id } as never}
              className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Kerjakan
            </Link>
          </div>
        )}
      />
    </SectionCard>
  );
}

// Greeting that matches the time of day — small touch that makes the home feel
// personal rather than like a report screen.
function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 11) return "Selamat pagi";
  if (h < 15) return "Selamat siang";
  if (h < 19) return "Selamat sore";
  return "Selamat malam";
}

// Which report form a row belongs to (drives the edit deep-link).
function formFor(jenis: string): "/laporan-awal" | "/laporan-akhir" {
  return /akhir/i.test(jenis) ? "/laporan-akhir" : "/laporan-awal";
}

interface StatusMeta {
  label: string;
  tone: string;
  /** true → the officer can/should act on this report (deep-link to edit). */
  actionable: boolean;
  cta: string;
}

function statusMeta(status: string): StatusMeta {
  switch (status.toUpperCase()) {
    case "DRAFT":
      return {
        label: "Draft",
        tone: "bg-slate-500/12 text-slate-600 dark:text-slate-300",
        actionable: true,
        cta: "Lanjutkan",
      };
    case "REJECTED":
      return {
        label: "Ditolak",
        tone: "bg-red-500/12 text-red-600 dark:text-red-400",
        actionable: true,
        cta: "Perbaiki",
      };
    case "REVISED":
    case "REVISION_REQUESTED":
      return {
        label: "Revisi",
        tone: "bg-orange-500/12 text-orange-600 dark:text-orange-400",
        actionable: true,
        cta: "Perbaiki",
      };
    case "PENDING":
      return {
        label: "Menunggu",
        tone: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
        actionable: false,
        cta: "",
      };
    case "APPROVED":
      return {
        label: "Disetujui",
        tone: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
        actionable: false,
        cta: "",
      };
    default:
      return { label: status, tone: "bg-muted text-muted-foreground", actionable: false, cta: "" };
  }
}

// A single tappable report row — used by both "Prioritas" and "Tugas Hari Ini".
function ReportRow({ r }: { r: RecentReport }) {
  const meta = statusMeta(r.status);
  const body = (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="size-3 shrink-0" />
          <span className="truncate">{r.lokasi || "Lokasi —"}</span>
        </div>
        <div className="truncate text-sm font-medium">{r.pekerjaan || "Pekerjaan —"}</div>
      </div>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.tone}`}>
        {meta.label}
      </span>
      {meta.actionable ? (
        <span className="flex shrink-0 items-center gap-0.5 text-xs font-semibold text-primary">
          {meta.cta} <ArrowRight className="size-3.5" />
        </span>
      ) : (
        <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
      )}
    </div>
  );

  // Actionable reports deep-link straight into edit mode; the rest open History.
  return meta.actionable ? (
    <Link
      to={formFor(r.jenis) as never}
      search={{ edit: r.id } as never}
      className="block rounded-xl p-2.5 transition-colors active:bg-muted"
    >
      {body}
    </Link>
  ) : (
    <Link
      to={"/history" as never}
      className="block rounded-xl p-2.5 transition-colors active:bg-muted"
    >
      {body}
    </Link>
  );
}

// Icon per jenis WO (dipakai badge bulat status di list "WO Terbaru").
function woIcon(type: WorkOrder["type"]) {
  return type === "CORRECTIVE" ? Wrench : ClipboardList;
}

const fmtDateLong = (d: Date) =>
  d.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

/** Screen 1 (mobile only) — m-banking home: hero card, quick menu, WO terbaru. */
function MobileHome({ firstName }: { firstName: string }) {
  const user = useAuthStore((s) => s.user);
  const initials = firstName.slice(0, 2).toUpperCase();
  const [aiOpen, setAiOpen] = useState(false);

  const listQ = workOrders.useList({ page: 1, limit: 50, mine: true });
  const items = listQ.data?.items ?? [];
  const active = items.filter((wo) => wo.status === "ASSIGNED" || wo.status === "ON_PROGRESS");
  const kritis = active.filter((wo) => wo.priority === "CRITICAL").length;
  const dikerjakan = active.filter((wo) => wo.status === "ON_PROGRESS").length;
  const assigned = active.filter((wo) => wo.status === "ASSIGNED").length;

  const statsQ2 = useWorkOrderStats({ mine: true });
  const total = statsQ2.data?.total ?? 0;
  const closed = statsQ2.data?.closed ?? 0;
  const progressPct = total > 0 ? Math.round((closed / total) * 100) : 0;

  const terbaru = [...items]
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .slice(0, 3);

  const quickMenu = [
    { label: "Work Order", to: "/work-order", icon: ClipboardList, color: "#f97316" },
    { label: "Laporan", to: "/history", icon: FileText, color: "#a855f7" },
    { label: "GIS", to: "/gis", icon: MapPin, color: "#22c55e" },
  ] as const;

  return (
    <div className="space-y-5">
      {/* 1 ── Topbar — greeting + tanggal (kiri), bell + avatar (kanan). */}
      <div className="flex items-center justify-between px-4 pt-safe pt-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-extrabold text-white">Halo, {firstName}!</p>
          <p className="text-[11px] text-white/40">{fmtDateLong(new Date())}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <NotificationCenter />
          <Link to="/profile" aria-label="Profil">
            <Avatar className="size-8 border border-white/10">
              {resolveAvatarUrl(user?.avatar) && (
                <AvatarImage src={resolveAvatarUrl(user?.avatar)} alt={user?.name ?? ""} />
              )}
              <AvatarFallback className="bg-primary/15 text-[11px] font-bold text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
          </Link>
        </div>
      </div>

      {/* 2 ── Hero card — WO aktif hari ini + mini stats + progress. */}
      <div
        className="relative mx-4 overflow-hidden rounded-[20px] p-4"
        style={{ background: "#1a1033" }}
      >
        <span
          className="pointer-events-none absolute -right-6 -top-8 size-28 rounded-full"
          style={{ background: "rgba(255,255,255,.06)" }}
          aria-hidden
        />
        <span
          className="pointer-events-none absolute -right-10 top-14 size-16 rounded-full"
          style={{ background: "rgba(255,255,255,.06)" }}
          aria-hidden
        />
        <div className="relative">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/40">
            WO Aktif Hari Ini
          </p>
          <p className="mt-1 text-[32px] font-black leading-none tabular-nums text-white">
            {listQ.isLoading ? "…" : active.length}
          </p>

          <div className="mt-4 flex items-center gap-4">
            <MiniStat label="Kritis" value={kritis} color="#ef4444" />
            <MiniStat label="Dikerjakan" value={dikerjakan} color="#f59e0b" />
            <MiniStat label="Assigned" value={assigned} color="#3b82f6" />
          </div>

          <div className="mt-4">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="mt-1.5 text-[10px] text-white/40">
              {closed} dari {total} WO selesai
            </p>
          </div>
        </div>
      </div>

      {/* 3 ── Quick menu — 4 kolom (WO / Laporan / GIS / AI VoltBot). */}
      <div className="grid grid-cols-4 gap-2.5 px-4">
        {quickMenu.map((m) => (
          <Link key={m.to} to={m.to as never} className="flex flex-col items-center gap-1.5">
            <motion.span
              whileTap={{ scale: 0.97 }}
              className="flex size-11 items-center justify-center rounded-[14px] border"
              style={{ background: "#1a1033", borderColor: "rgba(255,255,255,.07)" }}
            >
              <m.icon className="size-[18px]" style={{ color: m.color }} />
            </motion.span>
            <span className="text-center text-[10px] font-medium leading-tight text-white/60">
              {m.label}
            </span>
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setAiOpen(true)}
          className="flex flex-col items-center gap-1.5"
        >
          <motion.span
            whileTap={{ scale: 0.97 }}
            className="flex size-11 items-center justify-center rounded-[14px] border"
            style={{ background: "#1a1033", borderColor: "rgba(255,255,255,.07)" }}
          >
            <Sparkles className="size-[18px]" style={{ color: "#3b82f6" }} />
          </motion.span>
          <span className="text-center text-[10px] font-medium leading-tight text-white/60">
            AI VoltBot
          </span>
        </button>
      </div>
      <ChatDrawer open={aiOpen} onClose={() => setAiOpen(false)} />

      {/* 4 ── Divider full-bleed. */}
      <div className="h-1.5 w-full" style={{ background: "#0a0a12" }} />

      {/* 5 ── WO Terbaru — m-banking transaction list, max 3. */}
      <div className="px-4">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-[13px] font-extrabold text-white">WO Terbaru</h2>
          <Link
            to="/work-order"
            className="flex items-center gap-0.5 text-[11px] font-semibold text-primary"
          >
            Lihat semua <ChevronRight className="size-3.5" />
          </Link>
        </div>
        {listQ.isLoading ? (
          <div className="space-y-2 py-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-white/5" />
            ))}
          </div>
        ) : terbaru.length === 0 ? (
          <p className="py-6 text-center text-[12px] text-white/30">Belum ada work order.</p>
        ) : (
          <ul>
            {terbaru.map((wo) => {
              const Icon = woIcon(wo.type);
              const color = WO_MOBILE_COLOR[wo.status];
              return (
                <li key={wo.id} className="border-b border-white/[0.05] last:border-0">
                  <Link
                    to="/work-order/$id"
                    params={{ id: wo.id }}
                    className="flex touch-target items-center gap-3 py-3 active:opacity-70"
                  >
                    <span
                      className="flex size-9 shrink-0 items-center justify-center rounded-full"
                      style={{ background: `${color}26` }}
                    >
                      <Icon className="size-4" style={{ color }} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-bold text-white">
                        {wo.location?.name ?? wo.location?.code ?? wo.woNumber}
                      </p>
                      <p className="truncate text-[11px] text-white/40">{wo.title}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span
                        className="inline-block rounded-full px-2 py-0.5 text-[9px] font-bold"
                        style={{ background: `${color}26`, color }}
                      >
                        {WO_STATUS_LABELS[wo.status]}
                      </span>
                      <p className="mt-1 text-[9.5px] text-white/30">
                        {wo.dueDate
                          ? new Date(wo.dueDate).toLocaleDateString("id-ID", {
                              day: "2-digit",
                              month: "short",
                            })
                          : "—"}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="size-1.5 rounded-full" style={{ background: color }} />
      <span className="text-[11px] tabular-nums font-bold text-white">{value}</span>
      <span className="text-[10px] text-white/40">{label}</span>
    </div>
  );
}

export function PetugasDashboard() {
  const user = useAuthStore((s) => s.user);
  const userName = user?.name ?? "Petugas";
  const statsQ = useDashboardStatsRaw();
  const activity = useDashboardActivity();
  const s = statsQ.data;

  const recent: RecentReport[] = s?.recentReports ?? [];
  const priorities = recent.filter((r) => statusMeta(r.status).actionable).slice(0, 5);

  const firstName = userName.split(" ")[0];

  const statusPie: Slice[] = (s?.statusDistribution ?? []).map((d) => ({
    name: d.name,
    value: d.value,
  }));
  const trend: TrendPoint[] = (s?.trendReports ?? []).map((t) => ({
    date: t.date,
    Awal: t.awal ?? 0,
    Akhir: t.akhir ?? 0,
  }));

  // Tingkat persetujuan (real): disetujui / total laporan petugas.
  const approvalRate =
    s && s.totalReports > 0 ? Math.round((s.approvedReports / s.totalReports) * 100) : null;
  // Sparkline aktivitas 7 hari terakhir (awal + akhir per hari).
  const spark7 = (s?.trendReports ?? [])
    .slice(-7)
    .map((t) => ({ date: t.date, value: (t.awal ?? 0) + (t.akhir ?? 0) }));

  return (
    <>
      {/* Mobile (<768px) — bespoke m-banking home (Screen 1). Desktop/tablet
          below is untouched. */}
      <div className="md:hidden">
        <MobileHome firstName={firstName} />
      </div>

      <div className="hidden space-y-6 md:block">
        {/* 1 ── Hero (Opsi D) — gradient gelap PageHero dengan greeting + jam live
          + 3 mini-stat. Branded greeting banner = the page identity (the top bar
          shows only "Beranda"). */}
        <PageHero
          title={`${greeting()}, ${firstName} 👋`}
          description={`${user?.team?.name ?? "Tim Lapangan"}${
            user?.rtupp?.name ? ` · ${user.rtupp.name}` : ""
          }`}
          clock
        >
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <Link
              to="/history"
              className="flex-1 rounded-lg bg-white/[0.06] p-3 text-center transition-colors hover:bg-white/[0.1]"
            >
              <p className="text-xs text-white/40">Laporan Hari Ini</p>
              <p className="text-2xl font-semibold tabular-nums text-white">
                {statsQ.isLoading ? "…" : (s?.totalToday ?? 0)}
              </p>
            </Link>
            <Link
              to="/history"
              className="flex-1 rounded-lg bg-white/[0.06] p-3 text-center transition-colors hover:bg-white/[0.1]"
            >
              <p className="text-xs text-white/40">Menunggu Validasi</p>
              <p className="text-2xl font-semibold tabular-nums text-primary">
                {statsQ.isLoading ? "…" : (s?.pendingReports ?? 0)}
              </p>
            </Link>
            <Link
              to="/history"
              className="flex-1 rounded-lg bg-white/[0.06] p-3 text-center transition-colors hover:bg-white/[0.1]"
            >
              <p className="text-xs text-white/40">Disetujui</p>
              <p
                className="text-2xl font-semibold tabular-nums"
                style={{ color: CHART_COLORS.success }}
              >
                {statsQ.isLoading ? "…" : (s?.approvedReports ?? 0)}
              </p>
            </Link>
          </div>
        </PageHero>

        {/* 2 ── Gauge persetujuan + sparkline aktivitas 7 hari ─────────────────── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SectionCard title="Tingkat Persetujuan" icon={CheckCircle2}>
            {statsQ.isLoading ? (
              <div className="h-40 animate-pulse rounded-lg bg-muted" />
            ) : approvalRate == null ? (
              <p className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                Belum ada laporan
              </p>
            ) : (
              <GaugeSemicircle value={approvalRate} label="laporan disetujui" />
            )}
          </SectionCard>
          <SectionCard title="Aktivitas 7 Hari" icon={CalendarDays} className="sm:col-span-2">
            {statsQ.isLoading ? (
              <div className="h-[60px] animate-pulse rounded-lg bg-muted" />
            ) : spark7.length < 2 ? (
              <p className="flex h-[60px] items-center justify-center text-sm text-muted-foreground">
                Belum cukup data aktivitas
              </p>
            ) : (
              <SparkArea data={spark7} />
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Total laporan (awal + akhir) yang kamu kirim per hari, 7 hari terakhir.
            </p>
          </SectionCard>
        </div>

        {/* 3 ── Prioritas / Perlu Tindakan (drafts + rejected/revised) ───────── */}
        {(statsQ.isLoading || priorities.length > 0) && (
          <SectionCard title="Perlu Tindakan" icon={AlertTriangle}>
            <RecentList
              items={priorities}
              isLoading={statsQ.isLoading}
              empty="Tidak ada yang perlu diperbaiki 🎉"
              render={(r) => <ReportRow r={r} />}
            />
          </SectionCard>
        )}

        {/* 4 ── Quick actions (Opsi C: 2 tombol besar) ─────────────────────── */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Link
            to="/laporan-awal"
            className="flex touch-target items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 active:scale-[0.99]"
          >
            <FileText className="size-4" /> Buat Laporan Awal
          </Link>
          <Link
            to="/history"
            className="flex touch-target items-center justify-center gap-2 rounded-lg border border-primary bg-card px-4 py-3.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 active:scale-[0.99]"
          >
            <History className="size-4" /> Lihat Riwayat
          </Link>
        </div>

        {/* 5 ── Tugas Hari Ini — WO yang di-assign ke petugas (BE auto-scope) ── */}
        <TodayWorkOrders />

        {/* 6 ── Aktivitas terbaru ───────────────────────────────────────────── */}
        <SectionCard
          title="Aktivitas Terbaru"
          icon={History}
          testId="dashboard-recent-activity"
          action={
            <Link to="/history" className="text-xs text-primary hover:underline">
              Lihat riwayat
            </Link>
          }
        >
          <RecentList
            items={activity.items}
            isLoading={activity.isLoading}
            empty="Belum ada aktivitas"
            render={(a) => (
              <div className="text-sm">
                <span className="font-medium">{a.user}</span> {a.action}
                <div className="text-xs text-muted-foreground">
                  {a.entity} • {a.time}
                </div>
              </div>
            )}
          />
        </SectionCard>

        {/* ── Analytics (secondary — below the operational fold) ─────────────── */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <SectionCard title="Tren Laporan" icon={CalendarDays} className="lg:col-span-2">
            <TrendChart
              data={trend}
              series={[
                { key: "Awal", color: "var(--color-chart-1)", label: "Awal" },
                { key: "Akhir", color: "var(--color-chart-2)", label: "Akhir" },
              ]}
            />
          </SectionCard>

          <SectionCard title="Status Laporan" icon={CheckCircle2}>
            <DonutChart data={statusPie} />
            <DonutLegend data={statusPie} />
          </SectionCard>
        </div>
      </div>
    </>
  );
}
