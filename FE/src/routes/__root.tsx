import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, Link, createRootRouteWithContext, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { useAuthStore } from "@/stores/auth";
import { useIdleLogout } from "@/hooks/useIdleLogout";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { PWAUpdatePrompt } from "@/components/PWAUpdatePrompt";
import { ForceUpdateGate } from "@/components/ForceUpdateGate";
import { applyStatusBarTheme } from "@/lib/native/bootstrap";
import { resolveTheme } from "@/lib/theme";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Halaman tidak ditemukan</h2>
        <p className="mt-2 text-sm text-muted-foreground">Halaman yang Anda cari tidak tersedia.</p>
        <Link
          to="/dashboard"
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Ke Dashboard
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Terjadi kesalahan</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Coba lagi
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

// Tema Opsi C: preferensi tersimpan (lib/theme.ts) menang; tanpa preferensi,
// ikuti perangkat. main.tsx already painted the resolved theme pre-mount —
// this hook mirrors it into the auth store so any component reading `theme`
// (ThemeToggle, legacy Topbar, native splash seed) stays consistent, and keeps
// the native status-bar icon colour in sync (no-op on web).
function ThemeBoot() {
  useEffect(() => {
    const dark = resolveTheme() === "dark";
    document.documentElement.classList.toggle("dark", dark);
    useAuthStore.setState({ theme: dark ? "dark" : "light" });
    void applyStatusBarTheme(dark);
  }, []);
  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useIdleLogout();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeBoot />
      <ForceUpdateGate />
      <OfflineIndicator />
      <Outlet />
      <PWAUpdatePrompt />
      {/* On phones, drop toasts below the status bar / notch (safe-area top). */}
      <Toaster
        richColors
        position="top-right"
        mobileOffset={{ top: "calc(env(safe-area-inset-top) + 12px)", right: "12px", left: "12px" }}
      />
    </QueryClientProvider>
  );
}
