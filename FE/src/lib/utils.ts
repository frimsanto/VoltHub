import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Label gardu/lokasi: "KODE — Nama". Bila kode == nama (atau salah satunya kosong)
 * cukup tampilkan satu nilai — menghindari duplikat seperti "BT25 — BT25".
 * Relasi Gardu—Penyulang memakai format lain (tanda kurung), jadi tak terpengaruh.
 */
export function locationLabel(code?: string | null, name?: string | null): string {
  const c = (code ?? "").trim();
  const n = (name ?? "").trim();
  if (!c) return n || "—";
  if (!n) return c;
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (clean(c) === clean(n)) return n;
  return `${c} — ${n}`;
}
