// VoltHub — Theme resolution ("PLN Corporate Bold" / Opsi C).
// Preferensi user yang tersimpan menang; tanpa preferensi tersimpan, ikuti
// preferensi perangkat (prefers-color-scheme). Storage key lama dipertahankan
// agar pilihan user dari versi sebelumnya tetap terbaca.
// Single source of truth untuk main.tsx (pre-mount paint), ThemeBoot (store +
// native status-bar sync), dan ThemeToggle.

export const THEME_STORAGE_KEY = "volthub_theme";

export type Theme = "light" | "dark";
/** @deprecated alias lama — gunakan `Theme`. */
export type ThemeName = Theme;

/** Resolve tema aktif: preferensi tersimpan → preferensi perangkat → light. */
export function getTheme(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Private mode / quota — fall through ke preferensi perangkat.
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Terapkan tema ke document root dan persist sebagai preferensi user. */
export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Best-effort persistence.
  }
}

/** Toggle light ⇄ dark; mengembalikan tema baru. */
export function toggleTheme(): Theme {
  const next: Theme = getTheme() === "dark" ? "light" : "dark";
  applyTheme(next);
  return next;
}

/** @deprecated alias lama — gunakan `getTheme`. */
export const resolveTheme = getTheme;
/** @deprecated alias lama — gunakan `applyTheme`. */
export const setTheme = applyTheme;
