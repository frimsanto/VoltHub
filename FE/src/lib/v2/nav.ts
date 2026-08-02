// VoltHub — Navigation Architecture
//
// Single, declarative navigation source for the whole application. Visibility is
// role-driven (rbac.ts): every item carries an explicit `roles` allow-list (or a
// `capability` gate) so the sidebar a user sees exactly matches the routes they
// may load. The four canonical roles are MASTER, MANAGER, ADMIN and PETUGAS.
//
//   MASTER  — pure system administrator: System section + global READ (audit)
//             of dashboards/ops/master data, but NO operational writes
//             (approval, import, personil) — those are ADMIN-only.
//   MANAGER — read-only full visibility (monitoring): dashboards, asset, ops,
//             and management lists, but no write controls (capability-gated).
//             With rtuppId filled the same role acts as ASMEN (RTUPP-scoped).
//   ADMIN   — operational hub (asset/ops CRUD, approval, user management).
//   PETUGAS — field reporting only.

import {
  Home,
  LayoutDashboard,
  Building2,
  GitBranch,
  Boxes,
  ClipboardCheck,
  ShieldCheck,
  FileText,
  History,
  Upload,
  Users,
  UsersRound,
  Settings,
  RadioTower,
  BadgeCheck,
  MonitorPlay,
  Zap,
  GitFork,
  Network,
  FileCheck2,
  Map,
  ClipboardList,
  CloudUpload,
  FolderOpen,
  ArrowDownToLine,
  IdCard,
  Globe,
  UserCog,
  Briefcase,
  Brain,
} from "lucide-react";
import { can, hasRole } from "./rbac";
import type { V2Capability, V2Role } from "./rbac";

export type V2IconType = React.ComponentType<{ className?: string }>;

export interface V2NavLeaf {
  label: string;
  to: string;
  icon: V2IconType;
  /** Explicit role allow-list (optional). */
  roles?: readonly V2Role[];
  /** Semantic capability gate (preferred for admin sections). */
  capability?: V2Capability;
  /** Render as a disabled placeholder. */
  comingSoon?: boolean;
  /** Hanya tampil untuk user RTUPP1 (unit GIS) — atau MASTER (global). */
  rtupp1Only?: boolean;
  /** Hanya tampil untuk user RTUPP2-5 (unit GH) — atau MASTER (global). */
  ghOnly?: boolean;
  /** Hanya tampil untuk user RTUPP2-5 (unit Gardu Distribusi / MP) — atau MASTER (global). */
  mpOnly?: boolean;
}

export interface V2NavGroup {
  label: string;
  icon: V2IconType;
  children: V2NavLeaf[];
  capability?: V2Capability;
  roles?: readonly V2Role[];
}

export type V2NavNode = V2NavLeaf | V2NavGroup;

export const isV2Group = (n: V2NavNode): n is V2NavGroup => "children" in n;

// Role groups — the single source of which sidebar a role sees. Route guards
// (lib/v2/route-guards.ts) mirror these exact lists so URL access matches the UI.
const ALL_ROLES: readonly V2Role[] = ["MASTER", "MANAGER", "ADMIN", "PETUGAS", "NOC"] as const;
// The four "org" roles — everything NOC must NOT see (laporan/ops/master data).
const NON_NOC: readonly V2Role[] = ["MASTER", "MANAGER", "ADMIN", "PETUGAS"] as const;
const FIELD_ONLY: readonly V2Role[] = ["PETUGAS"] as const;
// Operational & asset pages: readable by the monitoring MANAGER; writes inside
// are capability-gated so MANAGER stays read-only.
const OPS_VIEW: readonly V2Role[] = ["MASTER", "MANAGER", "ADMIN"] as const;
// SCADA snapshot dashboards (Inscan/OOP, Lines) + GIS: monitoring tiers + NOC.
const SCADA_VIEW: readonly V2Role[] = ["MASTER", "MANAGER", "ADMIN", "NOC"] as const;
// SCADA Upload (replace snapshot SP7 harian): NOC owns it, MASTER/MANAGER stand in.
const SCADA_UPLOAD: readonly V2Role[] = ["MASTER", "MANAGER", "NOC"] as const;
// Operational-admin WRITE pages (Approval/Import/Personil): ADMIN only —
// MASTER bukan operational actor (pure system administrator), MANAGER read-only.
const ADMIN_TIER: readonly V2Role[] = ["ADMIN"] as const;
// User management: MASTER + ADMIN only. MANAGER is read-only and has no business
// with user accounts, so the section/page is hidden for it (route also guards).
const USER_MGMT: readonly V2Role[] = ["MASTER", "ADMIN"] as const;
// System-owner section: MASTER only.
const MASTER_ONLY: readonly V2Role[] = ["MASTER"] as const;

// Single VoltHub sitemap. One ordered list, filtered per role at render time.
// Business vocabulary (Gardu / Penyulang) is used for both labels and routes.
export const V2_NAV: V2NavNode[] = [
  // ── Beranda — home button standalone ke /dashboard (command center per role).
  // NOC dikecualikan: /dashboard me-redirect NOC ke /scada, jadi link-nya mubazir.
  { label: "Beranda", to: "/dashboard", icon: Home, roles: NON_NOC },

  // ── Dashboard (dropdown) ───────────────────────────────────────────────────
  // Konsolidasi: hanya dua dashboard di sidebar. Inscan/OOP dan SCADA Lines
  // menjadi TAB di dalam /scada; KPI dan Dashboard GI menjadi SECTION di dalam
  // /dashboard. NOC/PETUGAS hanya melihat satu anak, sehingga grup ini otomatis
  // dirender sebagai link langsung (collapse single-child di V2Sidebar).
  {
    label: "Dashboard",
    icon: LayoutDashboard,
    roles: ALL_ROLES,
    children: [
      // SCADA_VIEW (bukan OPS_VIEW) agar NOC tetap punya akses ke tab
      // Inscan/OOP & Lines yang kini hidup di dalam /scada.
      { label: "Dashboard SCADA", to: "/scada", icon: RadioTower, roles: SCADA_VIEW },
      { label: "Dashboard Lapangan", to: "/lapangan", icon: ClipboardCheck, roles: NON_NOC },
    ],
  },

  // ════════════════════════════════════════════════════════════════════════
  // DOMAIN 1 — Monitoring SCADA (dataset / otomatis): segala yang bersumber
  // dari registry jaringan + impor IFS. Dashboard + laporan dataset di sini.
  // ════════════════════════════════════════════════════════════════════════
  {
    label: "Monitoring SCADA",
    icon: RadioTower,
    roles: SCADA_VIEW,
    children: [
      // Control-room wall for a large display — MASTER only, always real-time.
      { label: "Pusat Monitoring", to: "/wall", icon: MonitorPlay, roles: MASTER_ONLY },
      // KPI Dashboard dipindah menjadi section di /dashboard (rute /kpi redirect).
      // GIS read-only untuk NOC juga (lokasi gardu, scope global).
      { label: "GIS Monitoring", to: "/gis", icon: Map, roles: SCADA_VIEW },
      // Performance Analytics di-nonaktifkan dari menu (Phase 1 RTUPP1 scope).
      // Rute /performance tetap ada; cukup sembunyikan dari navigasi.
      // { label: "Performance", to: "/performance", icon: Activity, roles: OPS_VIEW },
    ],
  },

  // ── SCADA Upload (NOC) — replace snapshot harian export Siemens SP7 ────────
  { label: "SCADA Upload", to: "/scada-upload", icon: CloudUpload, roles: SCADA_UPLOAD },

  // ── Master Data (Aset & Jaringan: registry GI → Bay → Penyulang → Aset) ────
  {
    label: "Master Data",
    icon: Boxes,
    roles: OPS_VIEW,
    children: [
      { label: "Gardu / GI", to: "/gardu", icon: Building2, roles: OPS_VIEW },
      { label: "Bay", to: "/bay", icon: GitBranch, roles: OPS_VIEW },
      { label: "Penyulang", to: "/penyulang", icon: GitFork, roles: OPS_VIEW },
      { label: "Aset", to: "/asset", icon: Briefcase, roles: OPS_VIEW },
    ],
  },

  // ════════════════════════════════════════════════════════════════════════
  // DOMAIN 2 — Operasional Lapangan (tim lapangan / manusia): dashboard,
  // laporan, dan approval yang diproduksi tim lapangan.
  // ════════════════════════════════════════════════════════════════════════
  {
    label: "Operasional Lapangan",
    icon: ClipboardCheck,
    roles: OPS_VIEW,
    children: [
      // Work Order = entry point operasional (Operation Management System GI RTUPP1).
      { label: "Work Order", to: "/work-order", icon: ClipboardList, roles: OPS_VIEW },
      // Monitoring + ekspor seluruh laporan lapangan (read-only) — termasuk MANAGER.
      {
        label: "Monitoring Laporan",
        to: "/laporan-monitoring",
        icon: ClipboardList,
        roles: OPS_VIEW,
      },
      // Approval laporan tim lapangan (write) — ADMIN only. MASTER masih bisa
      // buka /validasi via URL (read-only audit; tombol aksi capability-gated).
      { label: "Approval Laporan", to: "/validasi", icon: BadgeCheck, roles: ADMIN_TIER },
      // ── Menu khusus GI (RTUPP1 / unit GIS). Hanya tampil untuk user RTUPP1
      //    atau MASTER (gate rtupp1Only di V2Sidebar). ──
      // Dashboard GI dipindah menjadi section "GI Status" di /dashboard
      // (rute /gi-dashboard redirect ke sana).
      // Laporan GI & Laporan HAR GI = RIWAYAT read-only. Pembuatan HANYA dari Work Order.
      { label: "Laporan GI", to: "/inspeksi-gi", icon: Zap, roles: OPS_VIEW, rtupp1Only: true },
      {
        label: "Laporan HAR GI",
        to: "/har-gi",
        icon: ShieldCheck,
        roles: OPS_VIEW,
        rtupp1Only: true,
      },
      // ── Menu khusus GH (RTUPP2-5 / Gardu Hubung). ──
      {
        label: "Laporan Inspeksi GH",
        to: "/inspeksi-gh",
        icon: Network,
        roles: OPS_VIEW,
        ghOnly: true,
      },
      { label: "Laporan HAR GH", to: "/har-gh", icon: ShieldCheck, roles: OPS_VIEW, ghOnly: true },
      // ── Menu khusus MP (RTUPP2-5 / Metering Point / Gardu Distribusi). ──
      { label: "Inspeksi MP", to: "/inspeksi-mp", icon: FileCheck2, roles: OPS_VIEW, mpOnly: true },
      { label: "Laporan HAR MP", to: "/har-mp", icon: ShieldCheck, roles: OPS_VIEW, mpOnly: true },
    ],
  },

  // ── Pelaporan Lapangan (entri PETUGAS) ─────────────────────────────────────
  {
    label: "Pelaporan Lapangan",
    icon: FileText,
    roles: FIELD_ONLY,
    children: [
      // WO Saya = penugasan yang ditugaskan ke petugas (entry point lapangan).
      { label: "WO Saya", to: "/work-order", icon: ClipboardList, roles: FIELD_ONLY },
      { label: "Laporan Awal", to: "/laporan-awal", icon: FileText, roles: FIELD_ONLY },
      // Laporan GI & Laporan HAR GI = RIWAYAT read-only (pembuatan lewat Work Order).
      { label: "Laporan GI", to: "/inspeksi-gi", icon: Zap, roles: FIELD_ONLY, rtupp1Only: true },
      {
        label: "Laporan HAR GI",
        to: "/har-gi",
        icon: ShieldCheck,
        roles: FIELD_ONLY,
        rtupp1Only: true,
      },
      // ── Menu GH (RTUPP2-5 / Gardu Hubung). ──
      {
        label: "Laporan Inspeksi GH",
        to: "/inspeksi-gh",
        icon: Network,
        roles: FIELD_ONLY,
        ghOnly: true,
      },
      {
        label: "Laporan HAR GH",
        to: "/har-gh",
        icon: ShieldCheck,
        roles: FIELD_ONLY,
        ghOnly: true,
      },
      // ── Menu MP (RTUPP2-5 / Metering Point / Gardu Distribusi). ──
      {
        label: "Inspeksi MP",
        to: "/inspeksi-mp",
        icon: FileCheck2,
        roles: FIELD_ONLY,
        mpOnly: true,
      },
      {
        label: "Laporan HAR MP",
        to: "/har-mp",
        icon: ShieldCheck,
        roles: FIELD_ONLY,
        mpOnly: true,
      },
      { label: "Riwayat", to: "/history", icon: History, roles: FIELD_ONLY },
      // PETUGAS gets read-only GIS to locate the gardu of an assigned task.
      { label: "GIS Monitoring", to: "/gis", icon: Map, roles: FIELD_ONLY },
    ],
  },

  // ── Data & Tools ───────────────────────────────────────────────────────────
  {
    label: "Data & Tools",
    icon: Upload,
    roles: OPS_VIEW,
    children: [
      { label: "Documents", to: "/documents", icon: FolderOpen, roles: OPS_VIEW },
      // Import is a write operation — ADMIN only (no MASTER/MANAGER).
      { label: "Import", to: "/imports", icon: ArrowDownToLine, roles: ADMIN_TIER },
      // AI Assistant lives in the global floating button (AssistantFab), not the
      // sidebar — the full-page route /ai-search still exists (FAB "maximize").
    ],
  },

  // ── Manajemen User (MASTER/ADMIN manage, MANAGER reads) ────────────────────
  {
    label: "Manajemen",
    icon: Users,
    roles: USER_MGMT,
    children: [
      { label: "User Management", to: "/users", icon: Users, roles: USER_MGMT },
      // Master pelaksana lapangan per RTUPP (sumber pilihan personil Laporan Awal).
      { label: "Personil", to: "/personil", icon: IdCard, roles: ADMIN_TIER },
    ],
  },

  // ── Sistem (MASTER only) ───────────────────────────────────────────────────
  // RTUPP & Teams are live org-structure pages. Placeholder comingSoon entries
  // (Monitoring Sistem, Backup & Restore, Integrasi, Developer Tools) dihapus
  // dari sidebar untuk presentasi — tambahkan kembali saat rutenya siap.
  {
    label: "Sistem",
    icon: Settings,
    roles: MASTER_ONLY,
    children: [
      { label: "RTUPP", to: "/rtupp", icon: Globe, roles: MASTER_ONLY },
      { label: "Teams", to: "/teams", icon: UsersRound, roles: MASTER_ONLY },
      // Belum ada route-nya, tandai coming soon:
      { label: "Audit Log", to: "/audit-log", icon: History, roles: MASTER_ONLY, comingSoon: true },
      { label: "AI Aliases", to: "/ai-aliases", icon: Brain, roles: MASTER_ONLY, comingSoon: true },
    ],
  },

  { label: "Profile", to: "/profile", icon: UserCog, roles: ALL_ROLES },
];

// ── Shared visibility helpers ────────────────────────────────────────────────
// Role/RTUPP visibility gate for a nav node, mirroring the (private) copy inside
// V2Sidebar. Exported so alternate navigation surfaces — specifically the mobile
// nav shell's "More" sheet (components/mobile/MobileMoreSheet) — render the exact
// same role-scoped sitemap as the desktop sidebar. One source of truth, no drift.
// (The desktop V2Sidebar keeps its own copy so its rendering path is untouched.)
export function isNavVisible(
  node: {
    roles?: readonly V2Role[];
    capability?: V2Capability;
    rtupp1Only?: boolean;
    ghOnly?: boolean;
    mpOnly?: boolean;
  },
  role: V2Role,
  rtupp1: boolean,
): boolean {
  if (node.capability && !can(role, node.capability)) return false;
  if (node.roles && !hasRole(role, node.roles)) return false;
  if (node.rtupp1Only && !(rtupp1 || role === "MASTER")) return false;
  if (node.ghOnly && rtupp1 && role !== "MASTER") return false;
  if (node.mpOnly && rtupp1 && role !== "MASTER") return false;
  return true;
}

/** Role-filtered copy of the sitemap: keeps only visible nodes and prunes each
 *  group's children to the visible set, dropping groups left with no children. */
export function filterNavForRole(nodes: V2NavNode[], role: V2Role, rtupp1: boolean): V2NavNode[] {
  return nodes
    .filter((n) => isNavVisible(n, role, rtupp1))
    .map((n) =>
      isV2Group(n)
        ? { ...n, children: n.children.filter((c) => isNavVisible(c, role, rtupp1)) }
        : n,
    )
    .filter((n) => !isV2Group(n) || n.children.length > 0);
}
