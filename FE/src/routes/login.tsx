import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuthStore } from "@/stores/auth";
import { login as loginApi } from "@/lib/api/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Eye, EyeOff, Loader2, AlertCircle, ArrowRight } from "lucide-react";
import { showInfo } from "@/lib/swal";
import { BRAND_NAME } from "@/lib/brand";
import { BrandPanel } from "@/features/login/BrandPanel";
import { MobileBrand } from "@/features/login/MobileBrand";
import { usePublicStats } from "@/features/login/usePublicStats";

const REMEMBER_KEY = "voltreport_remember_email";
const HELPDESK_EMAIL = "helpdesk@pln.co.id";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({ meta: [{ title: `Login — ${BRAND_NAME}` }] }),
});

function LoginPage() {
  const nav = useNavigate();
  const login = useAuthStore((s) => s.login);
  const statsState = usePublicStats();
  const stats = statsState.status === "ready" ? statsState.data : null;

  // Load remembered email on initial mount only
  const [email, setEmail] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(REMEMBER_KEY) || "";
    }
    return "";
  });

  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Self-service reset isn't part of the internal flow — passwords are reset by
  // the user's supervising admin. Guide them to that channel instead of a dead button.
  async function handleForgotPassword() {
    await showInfo(
      "Lupa Password",
      "Untuk mereset password, hubungi admin/atasan Anda (Admin RTUPP & Petugas → Admin; Admin → Superadmin). " +
        `Bila tidak ada, hubungi Help Desk PLN di ${HELPDESK_EMAIL}.`,
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError("Email wajib diisi");
      return;
    }
    if (!password.trim()) {
      setError("Password wajib diisi");
      return;
    }

    setLoading(true);
    try {
      const result = await loginApi({ email, password });
      login(result.user, result.tokens);

      if (remember) {
        localStorage.setItem(REMEMBER_KEY, email);
      } else {
        localStorage.removeItem(REMEMBER_KEY);
      }

      // First login with a temporary password: force password change before
      // the user can reach any application route.
      if (result.user.mustChangePassword) {
        await showInfo(
          "Ganti Password",
          "Ini login pertama Anda. Silakan ganti password terlebih dahulu.",
        );
        await nav({ to: "/change-password" });
        return;
      }

      // Straight into the app — no success interstitial.
      await nav({ to: "/dashboard" });
    } catch (err: unknown) {
      let message = "Login gagal";
      if (err instanceof Error) {
        message = err.message;
      } else if (typeof err === "string") {
        message = err;
      } else if (
        typeof err === "object" &&
        err !== null &&
        "message" in err &&
        typeof (err as { message: unknown }).message === "string"
      ) {
        message = (err as { message: string }).message;
      }
      setError(message);
      setLoading(false);
    }
  }

  const busy = loading;

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[1.55fr_1fr]">
      {/* Desktop brand experience (≥lg) */}
      <BrandPanel stats={stats} />

      {/* Mobile brand banner (<lg) */}
      <MobileBrand stats={stats} />

      {/* Login card column */}
      <div className="flex flex-1 items-center justify-center px-6 py-10 pb-safe max-lg:px-4 max-lg:pt-0 sm:px-12">
        <div className="w-full max-w-md max-lg:max-w-none">
          {/* Form card — glassmorphism on desktop; overlapping "Split Glass" sheet on mobile */}
          <div className="rounded-2xl border border-border/50 bg-card/50 p-7 shadow-card backdrop-blur-sm sm:p-8 max-lg:-mx-4 max-lg:-mt-3.5 max-lg:rounded-t-[14px] max-lg:rounded-b-none max-lg:border-[0.5px] max-lg:border-b-0 max-lg:border-white/12 max-lg:bg-[rgba(22,29,46,0.85)] max-lg:p-[18px_16px_16px]">
            <div className="mb-8">
              <h2 className="text-2xl font-bold tracking-tight">Masuk ke akun Anda</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Gunakan kredensial PLN untuk melanjutkan.
              </p>
            </div>

            <form onSubmit={submit} className="space-y-4" noValidate>
              <div className="space-y-2">
                <Label htmlFor="email">Email atau Nomor HP</Label>
                <Input
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  disabled={busy}
                  aria-invalid={!!error}
                  required
                  className="h-12 rounded-xl max-lg:focus:border-pln-blue max-lg:focus:bg-pln-blue/5"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-xs font-medium text-primary hover:underline max-lg:text-pln-yellow"
                  >
                    Lupa password?
                  </button>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={show ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    disabled={busy}
                    aria-invalid={!!error}
                    required
                    className="h-12 rounded-xl pr-11 max-lg:focus:border-pln-blue max-lg:focus:bg-pln-blue/5"
                  />
                  <button
                    type="button"
                    onClick={() => setShow(!show)}
                    aria-label={show ? "Sembunyikan password" : "Tampilkan password"}
                    className="absolute right-3 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <Alert variant="destructive" role="alert" className="rounded-xl">
                  <AlertCircle className="size-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                <Checkbox
                  checked={remember}
                  onCheckedChange={(v) => setRemember(!!v)}
                  disabled={busy}
                />
                Ingat saya
              </label>

              <Button
                type="submit"
                data-testid="login-submit"
                disabled={busy}
                className="h-12 w-full rounded-xl gradient-pln text-base font-semibold text-white shadow-soft transition-all max-lg:rounded-[9px] max-lg:bg-none! max-lg:bg-pln-blue!"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" /> Memverifikasi…
                  </>
                ) : (
                  <>
                    Masuk <ArrowRight className="ml-2 size-4" />
                  </>
                )}
              </Button>
            </form>
          </div>

          <div className="mt-6 text-center text-xs text-muted-foreground">
            Butuh bantuan?{" "}
            <a
              href={`mailto:${HELPDESK_EMAIL}`}
              className="font-medium text-primary hover:underline"
            >
              Hubungi Help Desk PLN
            </a>
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground/60">
            © 2026 PT. Nakani Raya Group
          </p>
        </div>
      </div>
    </div>
  );
}
