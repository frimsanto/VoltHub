import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/common";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useAuthStore } from "@/stores/auth";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import {
  ShieldCheck,
  KeyRound,
  CheckCircle2,
  Camera,
  Loader2,
  Bell,
  HelpCircle,
  ChevronRight,
  LogOut,
  Mail,
  Phone,
  Building2,
  Users,
} from "lucide-react";
import { showSuccessAuto, showError, showConfirm } from "@/lib/swal";
import { displayRole, toV2Role } from "@/lib/v2/rbac";
import { useWorkOrderStats } from "@/features/v2/work-orders/resource";
import { APP_VERSION } from "@/lib/appVersion";
import {
  getProfile,
  updateProfile,
  uploadAvatar,
  resolveAvatarUrl,
  logoutServer,
} from "@/lib/api/auth";
import type { User } from "@/stores/auth";
import type { V2Role } from "@/lib/v2/rbac";
import { NotificationCenter } from "@/components/NotificationCenter";

export const Route = createFileRoute("/_app/profile")({
  component: ProfilePage,
  head: () => ({ meta: [{ title: "Profile — VoltHub" }] }),
});

/** Screen 9 (mobile only) — native profile: hero, stats, account/settings lists. */
function MobileProfile({
  user,
  role,
  avatarSrc,
  isActive,
  email,
  phone,
  onEmailChange,
  onPhoneChange,
  hasChanges,
  saving,
  onSave,
  onLogout,
}: {
  user: User;
  role: V2Role;
  avatarSrc?: string;
  isActive: boolean;
  email: string;
  phone: string;
  onEmailChange: (v: string) => void;
  onPhoneChange: (v: string) => void;
  hasChanges: boolean;
  saving: boolean;
  onSave: () => void;
  onLogout: () => void;
}) {
  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");
  const woStatsQ = useWorkOrderStats({ mine: true });
  const closed = woStatsQ.data?.closed ?? 0;
  const rejected = woStatsQ.data?.rejected ?? 0;
  const total = woStatsQ.data?.total ?? 0;
  const successRate =
    closed + rejected > 0 ? Math.round((closed / (closed + rejected)) * 100) : null;

  const [editOpen, setEditOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <div className="space-y-4 pb-8">
      {/* 1 ── Hero */}
      <div className="flex flex-col items-center px-4 pt-safe pt-6 text-center">
        <div className="relative">
          <Avatar
            className="size-[68px] border-2 border-white/10"
            style={{ background: "linear-gradient(135deg,#3b82f6,#1d4ed8)" }}
          >
            {avatarSrc && <AvatarImage src={avatarSrc} alt={user.name} className="object-cover" />}
            <AvatarFallback className="bg-transparent text-lg font-bold text-white">
              {initials}
            </AvatarFallback>
          </Avatar>
          {isActive && (
            <span
              className="absolute bottom-0.5 right-0.5 size-3.5 rounded-full border-2"
              style={{ background: "#22c55e", borderColor: "#0e0e16" }}
              aria-label="Online"
            />
          )}
        </div>
        <p className="mt-3 text-[16px] font-extrabold text-white">{user.name}</p>
        <p className="text-[11.5px] text-white/40">{user.email}</p>
        <div className="mt-2.5 flex flex-wrap justify-center gap-1.5">
          <span className="rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-bold text-primary">
            {displayRole(role, user.rtupp?.id)}
          </span>
          {user.team?.name && (
            <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-[10px] font-bold text-white/60">
              {user.team.name}
            </span>
          )}
        </div>
      </div>

      {/* 2 ── Stats row */}
      <div
        className="mx-4 grid grid-cols-3 rounded-2xl border p-3"
        style={{ background: "#131320", borderColor: "rgba(255,255,255,.07)" }}
      >
        <MStat value={woStatsQ.isLoading ? "…" : closed} label="WO Selesai" color="#f97316" />
        <MStat
          value={woStatsQ.isLoading ? "…" : successRate == null ? "—" : `${successRate}%`}
          label="Keberhasilan"
          color="#22c55e"
          divider
        />
        <MStat value={woStatsQ.isLoading ? "…" : total} label="Total WO" color="#a855f7" divider />
      </div>

      {/* 3 ── Informasi Akun */}
      <div className="px-4">
        <p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-wide text-white/30">
          Informasi Akun
        </p>
        <div
          className="overflow-hidden rounded-2xl border"
          style={{ background: "#131320", borderColor: "rgba(255,255,255,.07)" }}
        >
          <InfoRow
            icon={Mail}
            label="Email"
            value={email}
            editable
            onClick={() => setEditOpen(true)}
          />
          <InfoRow
            icon={Phone}
            label="No HP"
            value={phone || "—"}
            editable
            onClick={() => setEditOpen(true)}
          />
          <InfoRow icon={Building2} label="Unit (RTUPP)" value={user.rtupp?.name ?? "—"} />
          <InfoRow icon={Users} label="Tim" value={user.team?.name ?? "—"} last />
        </div>
      </div>

      {/* 4 ── Pengaturan */}
      <div className="px-4">
        <p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-wide text-white/30">
          Pengaturan
        </p>
        <div
          className="overflow-hidden rounded-2xl border"
          style={{ background: "#131320", borderColor: "rgba(255,255,255,.07)" }}
        >
          <div className="flex touch-target items-center gap-3 px-3.5 py-3">
            <IconBadge icon={Bell} color="#3b82f6" />
            <span className="flex-1 text-[12.5px] font-semibold text-white">Notifikasi</span>
            <NotificationCenter />
          </div>
          <Link
            to="/change-password"
            className="flex touch-target items-center gap-3 border-t border-white/[0.05] px-3.5 py-3 active:bg-white/5"
          >
            <IconBadge icon={KeyRound} color="#a855f7" />
            <span className="flex-1 text-[12.5px] font-semibold text-white">Ganti Password</span>
            <ChevronRight className="size-4 text-white/25" />
          </Link>
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="flex touch-target w-full items-center gap-3 border-t border-white/[0.05] px-3.5 py-3 text-left active:bg-white/5"
          >
            <IconBadge icon={HelpCircle} color="#f97316" />
            <span className="flex-1 text-[12.5px] font-semibold text-white">Bantuan</span>
            <ChevronRight className="size-4 text-white/25" />
          </button>
        </div>
      </div>

      {/* 5 ── Logout */}
      <div className="px-4">
        <motion.button
          whileTap={{ scale: 0.97 }}
          type="button"
          onClick={onLogout}
          className="flex touch-target w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[13px] font-bold text-white"
          style={{ background: "#ef4444" }}
        >
          <LogOut className="size-4" /> Keluar
        </motion.button>
      </div>

      {/* 6 ── App version */}
      <p className="text-center text-[8px] text-white/25">VoltHub v{APP_VERSION}</p>

      {/* Edit kontak sheet */}
      <Drawer open={editOpen} onOpenChange={setEditOpen}>
        <DrawerContent className="pb-safe">
          <DrawerHeader className="text-left">
            <DrawerTitle>Edit Kontak</DrawerTitle>
          </DrawerHeader>
          <div className="space-y-4 px-4 pb-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input type="email" value={email} onChange={(e) => onEmailChange(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Nomor HP</Label>
              <Input
                value={phone}
                onChange={(e) => onPhoneChange(e.target.value)}
                placeholder="08xxxxxxxxxx"
              />
            </div>
            <Button
              className="w-full touch-target"
              disabled={!hasChanges || saving}
              onClick={() => {
                onSave();
                setEditOpen(false);
              }}
            >
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
              Simpan Perubahan
            </Button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Bantuan sheet */}
      <Drawer open={helpOpen} onOpenChange={setHelpOpen}>
        <DrawerContent className="pb-safe">
          <DrawerHeader className="text-left">
            <DrawerTitle>Bantuan</DrawerTitle>
          </DrawerHeader>
          <div className="space-y-2 px-4 pb-4 text-[13px] text-white/60">
            <p>Hubungi Admin RTUPP Anda untuk bantuan teknis atau kendala akun.</p>
            <p className="text-white/30">VoltHub v{APP_VERSION}</p>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

function MStat({
  value,
  label,
  color,
  divider,
}: {
  value: ReactNode;
  label: string;
  color: string;
  divider?: boolean;
}) {
  return (
    <div className={`text-center ${divider ? "border-l border-white/[0.07]" : ""}`}>
      <p className="text-[16px] font-extrabold tabular-nums" style={{ color }}>
        {value}
      </p>
      <p className="mt-0.5 text-[9px] text-white/40">{label}</p>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
  editable,
  last,
  onClick,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
  editable?: boolean;
  last?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <IconBadge icon={Icon} color="rgba(255,255,255,.5)" />
      <span className="min-w-0 flex-1">
        <span className="block text-[9.5px] text-white/30">{label}</span>
        <span className="block truncate text-[12.5px] font-semibold text-white">{value}</span>
      </span>
      {editable && <ChevronRight className="size-4 shrink-0 text-white/25" />}
    </>
  );
  const cls = `flex touch-target w-full items-center gap-3 px-3.5 py-3 text-left ${
    last ? "" : "border-b border-white/[0.05]"
  } ${editable ? "active:bg-white/5" : ""}`;
  return editable ? (
    <button type="button" onClick={onClick} className={cls}>
      {content}
    </button>
  ) : (
    <div className={cls}>{content}</div>
  );
}

function IconBadge({ icon: Icon, color }: { icon: typeof Mail; color: string }) {
  return (
    <span
      className="flex size-8 shrink-0 items-center justify-center rounded-full"
      style={{ background: "rgba(255,255,255,.06)" }}
    >
      <Icon className="size-4" style={{ color }} />
    </span>
  );
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ProfilePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const storeUpdateProfile = useAuthStore((s) => s.updateProfile);
  const logout = useAuthStore((s) => s.logout);

  // Live profile data (stats + canonical fields) from the backend.
  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
  });

  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [dirtyInit, setDirtyInit] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Optimistic local preview of the just-picked file (object URL), shown instantly
  // while the upload is in flight so the avatar never appears to "do nothing".
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  // Seed the form once the profile loads (without clobbering edits in progress).
  if (profile && !dirtyInit) {
    setEmail(profile.email);
    setPhone(profile.phone ?? "");
    setDirtyInit(true);
  }

  const saveMutation = useMutation({
    mutationFn: () => updateProfile({ email, phone }),
    onSuccess: (updated) => {
      // Keep the global auth store in sync so the header/sidebar reflect changes.
      storeUpdateProfile({ email: updated.email, phone: updated.phone });
      qc.invalidateQueries({ queryKey: ["profile"] });
      showSuccessAuto("Perubahan tersimpan", undefined, 1200);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Gagal menyimpan perubahan";
      showError("Gagal menyimpan", msg);
    },
  });

  const avatarMutation = useMutation({
    mutationFn: (file: File) => uploadAvatar(file),
    onSuccess: (updated) => {
      // Adopt the server URL, then drop the local preview (the real image is live).
      storeUpdateProfile({ avatar: updated.avatar });
      qc.invalidateQueries({ queryKey: ["profile"] });
      setPreview(null);
      showSuccessAuto("Foto profil diperbarui", undefined, 1200);
    },
    onError: (err: unknown) => {
      setPreview(null); // revert to the previous avatar on failure
      const msg = err instanceof Error ? err.message : "Gagal mengunggah foto";
      showError("Gagal mengunggah foto", msg);
    },
  });

  const handleAvatarPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    if (!["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(file.type)) {
      showError("Format tidak didukung", "Gunakan foto JPG, PNG, atau WEBP.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showError("Ukuran terlalu besar", "Maksimal 5 MB.");
      return;
    }
    setPreview(URL.createObjectURL(file));
    avatarMutation.mutate(file);
  };

  const logoutAllMutation = useMutation({
    mutationFn: () => logoutServer(useAuthStore.getState().refreshToken, "all"),
    onSuccess: () => {
      // All sessions revoked server-side; clear this device and return to login.
      logout();
      navigate({ to: "/login" });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Gagal keluar dari semua perangkat";
      showError("Gagal", msg);
    },
  });

  if (!user) return null;

  const isActive = profile?.isActive ?? user.isActive;
  // Only feed AvatarImage a real URL; passing `undefined` keeps an empty <img>
  // mounted (renders as a black circle) instead of revealing the initials fallback.
  const avatarSrc = preview ?? resolveAvatarUrl(profile?.avatar ?? user.avatar);
  const hasChanges =
    email !== (profile?.email ?? user.email) || phone !== (profile?.phone ?? user.phone ?? "");

  const handleLogoutAll = async () => {
    const res = await showConfirm(
      "Keluar dari semua perangkat?",
      "Semua sesi aktif Anda akan dicabut. Anda harus login ulang.",
      "Ya, keluar semua",
    );
    if (res.isConfirmed) logoutAllMutation.mutate();
  };

  const role = toV2Role(user.role);

  const handleLogout = () => {
    logout();
    navigate({ to: "/login", replace: true });
  };

  return (
    <>
      {/* Mobile (<768px) — bespoke native profile (Screen 9), PETUGAS only. */}
      {role === "PETUGAS" && (
        <div className="-mx-4 -mt-4 sm:-mx-6 sm:-mt-6 md:hidden">
          <MobileProfile
            user={user}
            role={role}
            avatarSrc={avatarSrc}
            isActive={isActive}
            email={email}
            phone={phone}
            onEmailChange={setEmail}
            onPhoneChange={setPhone}
            hasChanges={hasChanges}
            saving={saveMutation.isPending}
            onSave={() => saveMutation.mutate()}
            onLogout={handleLogout}
          />
        </div>
      )}

      <div className={role === "PETUGAS" ? "hidden md:block space-y-6" : "space-y-6"}>
        <PageHeader title="Profile Saya" description="Kelola informasi akun dan keamanan." />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="rounded-2xl shadow-soft border-border/60 overflow-hidden">
            <div className="h-24 gradient-pln" />
            <CardContent className="p-5 -mt-12">
              <div className="relative w-fit">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={avatarMutation.isPending}
                  title="Ubah foto profil"
                  aria-label="Ubah foto profil"
                  className="group relative block rounded-full ring-2 ring-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Avatar className="size-24 border-4 border-card shadow-soft">
                    {avatarSrc && (
                      <AvatarImage
                        data-testid="profile-avatar-img"
                        src={avatarSrc}
                        alt={user.name}
                        className="object-cover"
                      />
                    )}
                    <AvatarFallback className="bg-pln-yellow text-2xl font-bold text-pln-blue-dark">
                      {user.name
                        .split(" ")
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join("")}
                    </AvatarFallback>
                  </Avatar>
                  {/* Hover/tap affordance */}
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-black/0 opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100">
                    <Camera className="size-6 text-white" />
                  </span>
                  {/* Upload loading overlay */}
                  {avatarMutation.isPending && (
                    <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45">
                      <Loader2 className="size-6 animate-spin text-white" />
                    </span>
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  data-testid="profile-avatar-input"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleAvatarPick}
                />
                <span className="absolute bottom-1 right-1 grid size-7 place-items-center rounded-full border-2 border-card bg-primary text-primary-foreground">
                  <Camera className="size-3.5" />
                </span>
              </div>
              <div className="mt-4">
                <div className="font-bold text-lg">{user.name}</div>
                <div className="text-sm text-muted-foreground">{profile?.email ?? user.email}</div>
                <div className="flex flex-wrap gap-2 mt-3">
                  {/* MANAGER ber-RTUPP tampil sebagai "Asisten Manager" (ASMEN). */}
                  <Badge variant="outline">
                    {displayRole(toV2Role(user.role), user.rtupp?.id)}
                  </Badge>
                  <Badge variant="secondary">
                    <CheckCircle2
                      className={`size-3 mr-1 ${isActive ? "text-success" : "text-muted-foreground"}`}
                    />
                    {isActive ? "Active" : "Nonaktif"}
                  </Badge>
                </div>
              </div>
              <div className="mt-5 pt-5 border-t border-border/60 space-y-2 text-sm">
                <Row label="RTUPP" value={user.rtupp?.name ?? "-"} />
                <Row label="Team" value={user.team?.name ?? "-"} />
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2 rounded-2xl shadow-soft border-border/60">
            <CardHeader>
              <CardTitle className="text-base">Informasi Akun</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Nama Akun (readonly)</Label>
                <Input
                  value={user.name}
                  readOnly
                  className="rounded-xl mt-1.5 bg-muted/40 text-foreground"
                />
              </div>
              <div>
                <Label className="text-xs">Role (readonly)</Label>
                <Input
                  value={displayRole(toV2Role(user.role), user.rtupp?.id)}
                  readOnly
                  className="rounded-xl mt-1.5 bg-muted/40 text-foreground"
                />
              </div>
              <div>
                <Label className="text-xs">RTUPP (readonly)</Label>
                <Input
                  value={user.rtupp?.name ?? "-"}
                  readOnly
                  className="rounded-xl mt-1.5 bg-muted/40 text-foreground"
                />
              </div>
              <div>
                <Label className="text-xs">Team (readonly)</Label>
                <Input
                  value={user.team?.name ?? "-"}
                  readOnly
                  className="rounded-xl mt-1.5 bg-muted/40 text-foreground"
                />
              </div>
              <div>
                <Label className="text-xs">Email</Label>
                <Input
                  type="email"
                  data-testid="profile-email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="rounded-xl mt-1.5"
                />
              </div>
              <div>
                <Label className="text-xs">Nomor HP</Label>
                <Input
                  data-testid="profile-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="rounded-xl mt-1.5"
                  placeholder="08xxxxxxxxxx"
                />
              </div>
              <div className="md:col-span-2 flex justify-end">
                <Button
                  className="rounded-xl gradient-pln text-white"
                  data-testid="profile-save"
                  disabled={!hasChanges || saveMutation.isPending}
                  onClick={() => saveMutation.mutate()}
                >
                  {saveMutation.isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
                  Simpan Perubahan
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="rounded-2xl shadow-soft border-border/60">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="size-4 text-success" /> Keamanan
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <SecRow
                title="Password"
                value="Ubah password akun Anda"
                cta="Ubah Password"
                onClick={() => navigate({ to: "/change-password" })}
              />
              <SecRow
                title="Two-Factor Authentication"
                value="Belum tersedia"
                cta="Aktifkan"
                disabled
              />
              <SecRow
                title="Sesi Aktif"
                value={isLoading ? "Memuat…" : `${profile?.activeSessions ?? 0} perangkat aktif`}
                cta="Keluar semua"
                onClick={handleLogoutAll}
                loading={logoutAllMutation.isPending}
              />
            </CardContent>
          </Card>
          <Card className="rounded-2xl shadow-soft border-border/60">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <KeyRound className="size-4 text-info" /> Status Akun
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <SecRow
                title="Status"
                value={
                  <Badge
                    variant="outline"
                    className={
                      isActive
                        ? "border-success/40 text-success"
                        : "border-border text-muted-foreground"
                    }
                  >
                    {isActive ? "Active" : "Nonaktif"}
                  </Badge>
                }
              />
              <SecRow
                title="Login terakhir"
                value={isLoading ? "Memuat…" : formatDateTime(profile?.lastLoginAt)}
              />
              <SecRow
                title="Akun dibuat"
                value={isLoading ? "Memuat…" : formatDateTime(profile?.createdAt)}
              />
              <SecRow
                title="Total laporan"
                value={isLoading ? "Memuat…" : String(profile?.reportCount ?? 0)}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground text-xs uppercase tracking-wider">{label}</span>
      <span className="font-medium text-right truncate">{value}</span>
    </div>
  );
}

function SecRow({
  title,
  value,
  cta,
  onClick,
  disabled,
  loading,
}: {
  title: string;
  value: React.ReactNode;
  cta?: string;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <div className="flex items-center justify-between p-3 rounded-xl bg-muted/40">
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{value}</div>
      </div>
      {cta && (
        <Button
          size="sm"
          variant="outline"
          className="rounded-lg"
          onClick={onClick}
          disabled={disabled || loading}
        >
          {loading && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
          {cta}
        </Button>
      )}
    </div>
  );
}
