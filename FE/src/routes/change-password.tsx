import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuthStore } from "@/stores/auth";
import { changePassword } from "@/lib/api/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Eye, EyeOff, Zap, Loader2, AlertCircle, KeyRound } from "lucide-react";
import { showSuccessAuto, showError } from "@/lib/swal";
import { requireAuth } from "@/lib/route-guards";
import { BRAND_NAME } from "@/lib/brand";

export const Route = createFileRoute("/change-password")({
  beforeLoad: () => {
    requireAuth();
  },
  component: ChangePasswordPage,
  head: () => ({ meta: [{ title: `Ganti Password — ${BRAND_NAME}` }] }),
});

function ChangePasswordPage() {
  const nav = useNavigate();
  const user = useAuthStore((s) => s.user);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const logout = useAuthStore((s) => s.logout);

  // First login (temporary password) cannot be skipped.
  const isForced = !!user?.mustChangePassword;

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) {
      setError("Semua field wajib diisi");
      return;
    }
    if (newPassword.length < 6) {
      setError("Password baru minimal 6 karakter");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Konfirmasi password tidak cocok");
      return;
    }
    if (newPassword === currentPassword) {
      setError("Password baru harus berbeda dari password lama");
      return;
    }

    setLoading(true);
    try {
      await changePassword({ currentPassword, newPassword });

      // Clear the first-login flag locally so guards let the user through.
      updateProfile({ mustChangePassword: false });

      await showSuccessAuto("Password berhasil diganti", "Selamat datang!", 1400);
      await nav({ to: "/dashboard" });
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.message || "Gagal mengganti password";
      setError(message);
      await showError("Gagal mengganti password", message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <div className="size-10 rounded-xl bg-pln-yellow flex items-center justify-center">
            <Zap className="size-5 text-pln-blue-dark" strokeWidth={2.5} />
          </div>
          <div className="font-bold text-lg">{BRAND_NAME}</div>
        </div>

        <div className="flex items-center gap-2 mb-1">
          <KeyRound className="size-5 text-primary" />
          <h2 className="text-2xl font-bold tracking-tight">Ganti Password</h2>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {isForced
            ? "Login pertama Anda menggunakan password sementara. Demi keamanan, ganti password sekarang sebelum melanjutkan."
            : "Perbarui password akun Anda."}
        </p>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current">Password Saat Ini</Label>
            <div className="relative">
              <Input
                id="current"
                type={showCurrent ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                className="h-11 rounded-xl pr-10"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                {showCurrent ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="new">Password Baru</Label>
            <div className="relative">
              <Input
                id="new"
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                className="h-11 rounded-xl pr-10"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                {showNew ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm">Konfirmasi Password Baru</Label>
            <Input
              id="confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="h-11 rounded-xl"
            />
          </div>

          {error && (
            <Alert variant="destructive" className="rounded-xl">
              <AlertCircle className="size-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-11 rounded-xl gradient-pln text-white font-semibold"
          >
            {loading ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" /> Menyimpan...
              </>
            ) : (
              "Simpan Password Baru"
            )}
          </Button>

          <button
            type="button"
            onClick={() => {
              logout();
              nav({ to: "/login" });
            }}
            className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Keluar
          </button>
        </form>
      </div>
    </div>
  );
}
