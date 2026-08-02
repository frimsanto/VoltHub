// VoltHub — Theme toggle (Opsi C "PLN Corporate Bold").
// Tombol ghost 36×36 dengan ikon Sun (saat dark → klik ke light) / Moon (saat
// light → klik ke dark). Sumber kebenaran tema = stores/auth (dimirror dari
// lib/theme oleh ThemeBoot); toggle di sini mem-persist via store.toggleTheme
// dan menyinkronkan warna status bar native (no-op di web).
import { Moon, Sun } from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { applyStatusBarTheme } from "@/lib/native/bootstrap";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useAuthStore((s) => s.theme);
  const toggleTheme = useAuthStore((s) => s.toggleTheme);
  const isDark = theme === "dark";

  const handleClick = () => {
    toggleTheme();
    void applyStatusBarTheme(!isDark);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={isDark ? "Aktifkan mode terang" : "Aktifkan mode gelap"}
      title={isDark ? "Mode terang" : "Mode gelap"}
      className={cn(
        "inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg",
        "text-current transition-colors duration-200 hover:bg-accent hover:text-accent-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
