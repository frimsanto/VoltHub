// VoltHub — global quick-search (command palette).
// Cmd/Ctrl-K opens a fuzzy navigator for every major area of the app. Built on
// the existing cmdk-based command UI; no new dependency. Keeps the topbar useful
// and fast for power users (DESIGN_SYSTEM — navigation).
//
// The result list is derived from the SAME role-filtered navigation model used
// by the sidebar (lib/v2/nav.ts), so a user only ever searches pages they can
// actually open — a PETUGAS sees their field-reporting items, not OPS pages.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { useV2Role, hasRole, can } from "@/lib/v2/rbac";
import { V2_NAV, isV2Group, type V2NavLeaf, type V2NavNode } from "@/lib/v2/nav";

// Extra search keywords per route (synonyms / aliases) so fuzzy matching stays
// useful. Labels themselves are always searchable; this only enriches matches.
const KEYWORDS: Record<string, string> = {
  "/dashboard": "beranda home ringkasan",
  "/lapangan": "dashboard lapangan operasional tim",
  "/scada": "dashboard scada dataset monitoring",
  "/scada-realtime": "inscan oop realtime gardu rc status",
  "/kpi": "kinerja indikator",
  "/gis": "peta map lokasi",
  "/gardu": "lokasi site gi gh",
  "/penyulang": "feeder",
  "/asset": "rtu rectifier baterai modem aset perangkat",
  "/inspection": "inspeksi temuan",
  "/tickets": "tiket gangguan work order",
  "/har": "hasil analisa rutin",
  "/performance": "availability kinerja",
  "/documents": "dokumen berkas",
  "/imports": "impor upload excel",
  "/ai-search": "cari pencarian ai assistant",
  "/users": "user pengguna manajemen akun",
  "/profile": "akun pengaturan",
  "/laporan-awal": "laporan awal form sebelum pekerjaan",
  "/laporan-akhir": "laporan akhir form setelah pekerjaan",
  "/history": "riwayat history",
  "/validasi": "approval validasi laporan",
  "/wall": "pusat monitoring wall display",
  "/rtupp": "rtupp organisasi unit",
  "/teams": "team tim regu",
};

interface SearchItem {
  label: string;
  to: string;
  icon: V2NavLeaf["icon"];
  keywords?: string;
  group: string;
}

// Mirrors the sidebar's visibility rule (capability gate then role allow-list).
function visible(node: { roles?: readonly any[]; capability?: any }, role: ReturnType<typeof useV2Role>) {
  if (node.capability && !can(role, node.capability)) return false;
  if (node.roles && !hasRole(role, node.roles)) return false;
  return true;
}

/** Flatten the role-filtered nav into searchable leaf items (skip placeholders). */
function buildItems(role: ReturnType<typeof useV2Role>): SearchItem[] {
  const out: SearchItem[] = [];
  const push = (leaf: V2NavLeaf, group: string) => {
    if (leaf.comingSoon || !visible(leaf, role)) return;
    out.push({ label: leaf.label, to: leaf.to, icon: leaf.icon, keywords: KEYWORDS[leaf.to], group });
  };
  for (const node of V2_NAV as V2NavNode[]) {
    if (!visible(node, role)) continue;
    if (isV2Group(node)) node.children.forEach((c) => push(c, node.label));
    else push(node, node.label);
  }
  return out;
}

/** Trigger button + Cmd/Ctrl-K command palette for global navigation. */
export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const role = useV2Role();

  const items = useMemo(() => buildItems(role), [role]);
  const groups = useMemo(() => [...new Set(items.map((i) => i.group))], [items]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const go = (to: string) => {
    setOpen(false);
    navigate({ to: to as never });
  };

  return (
    <>
      {/* Opsi D: pill search bg-muted kecil (11px) dengan kbd Ctrl K. */}
      <button
        onClick={() => setOpen(true)}
        className="flex cursor-pointer items-center gap-[7px] rounded-[8px] bg-muted px-[12px] py-[6px] text-[11px] text-muted-foreground transition-colors hover:bg-muted/80"
        aria-label="Cari (Ctrl+K)"
      >
        <Search className="size-[12px]" />
        <span className="hidden sm:inline">Cari menu...</span>
        <kbd className="ml-4 hidden rounded-[3px] bg-black/[0.08] px-[5px] py-[1px] text-[9px] dark:bg-white/[0.08] sm:inline">
          Ctrl K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Cari halaman, menu, atau fitur…" />
        <CommandList>
          <CommandEmpty>Tidak ada hasil.</CommandEmpty>
          {groups.map((group) => (
            <CommandGroup key={group} heading={group}>
              {items
                .filter((i) => i.group === group)
                .map((item) => (
                  <CommandItem
                    key={item.to}
                    value={`${item.label} ${item.keywords ?? ""}`}
                    onSelect={() => go(item.to)}
                  >
                    <item.icon className="mr-2 size-4" />
                    {item.label}
                  </CommandItem>
                ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
