// VoltHub — Administration forms (User / Team / RTUPP / Reset Password).
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextField, SelectField, SwitchField, type SelectOption } from "@/components/v2/fields";
import { toOptions } from "@/lib/v2/enums";
import { useV2Role } from "@/lib/v2/rbac";
import { useAuthStore } from "@/stores/auth";
import { useRtuppDropdown } from "./hooks";

// The 5 RTUPP units in PLN Jakarta. The selector is intentionally static — the
// backend find-or-creates the RTUPP by name (resolveRtuppIdByName), so no
// arbitrary RTUPPs (e.g. legacy "JAKSEL") are offered. Names use the existing
// "RTUPP N" convention so option 5 reuses the existing record instead of
// duplicating it. RTUPP 1 is the GIS unit (Penyulang / Lokasi GI) — see
// lib/v2/rtupp.isRtupp1User.
const RTUPP_OPTIONS: SelectOption[] = [1, 2, 3, 4, 5].map((n) => ({
  value: `RTUPP ${n}`,
  label: `RTUPP${n}`,
}));

// Teams are likewise selected by name and find-or-created under the chosen RTUPP
// (resolveTeamIdByName), so a Petugas can always be placed on a team within the
// RTUPP just picked — no cross-RTUPP "team not in this RTUPP" mismatch.
const TEAM_OPTIONS: SelectOption[] = ["A", "B"].map((t) => ({
  value: `Tim ${t}`,
  label: `Tim ${t}`,
}));

// Canonical VoltHub roles. Only MASTER may provision MANAGER/MASTER/NOC
// accounts; ADMIN is limited to PETUGAS/ADMIN (enforced again on the backend).
// NOC = control-room operator (SCADA upload + monitoring, not RTUPP-bound).
const ROLES = ["PETUGAS", "ADMIN", "MANAGER", "MASTER", "NOC"] as const;
const ADMIN_ASSIGNABLE_ROLES = ["PETUGAS", "ADMIN"] as const;
const ROLE_LABELS: Record<(typeof ROLES)[number], string> = {
  PETUGAS: "Petugas",
  ADMIN: "Admin",
  MANAGER: "Manager",
  MASTER: "Master",
  NOC: "NOC",
};

// ── User ──────────────────────────────────────────────────────────────────────
const baseUser = {
  name: z.string().min(1, "Nama wajib diisi"),
  role: z.enum(ROLES),
  phone: z.string().nullish(),
  // RTUPP & Team are selected by name (static lists, find-or-create on the
  // backend) rather than by id.
  rtuppName: z.string().nullish(),
  teamName: z.string().nullish(),
};
export const userCreateSchema = z.object({
  ...baseUser,
  email: z.string().email("Email tidak valid"),
  password: z.string().min(6, "Password minimal 6 karakter"),
});
export const userEditSchema = z.object({ ...baseUser, isActive: z.boolean().optional() });
export type UserCreateValues = z.infer<typeof userCreateSchema>;
export type UserEditValues = z.infer<typeof userEditSchema>;

export function UserForm({
  isEdit,
  defaultValues,
  onSubmit,
  onCancel,
  submitting,
}: {
  isEdit?: boolean;
  defaultValues?: Partial<UserCreateValues & UserEditValues>;
  onSubmit: (values: UserCreateValues | UserEditValues) => void;
  onCancel: () => void;
  submitting?: boolean;
}) {
  const form = useForm<UserCreateValues | UserEditValues>({
    // Schema is one of two shapes (create has email/password); relax the resolver
    // type at this single boundary so the union typechecks.
    resolver: zodResolver((isEdit ? userEditSchema : userCreateSchema) as never) as never,
    defaultValues: {
      name: "",
      role: "PETUGAS",
      phone: null,
      rtuppName: null,
      teamName: null,
      ...(isEdit ? { isActive: true } : { email: "", password: "" }),
      ...defaultValues,
    } as never,
  });
  const { control, handleSubmit, watch } = form;
  // Team only applies to PETUGAS (field officers work in a team). ADMIN owns all
  // teams within their RTUPP, and MANAGER/MASTER are global — so no Team for them.
  const isPetugas = watch("role") === "PETUGAS";
  // MASTER account protection: a MASTER account may not be disabled. (Legacy
  // SUPERADMIN roles are normalised to MASTER before reaching this form.)
  const isMasterAccount = defaultValues?.role === "MASTER";
  // Only MASTER operators may assign MANAGER/MASTER roles.
  // MANAGER may assign ADMIN/PETUGAS.
  // ADMIN may only assign PETUGAS.
  const operatorRole = useV2Role();
  const assignableRoles = useMemo(() => {
    if (operatorRole === "MASTER") return ROLES;
    if (operatorRole === "MANAGER") return ADMIN_ASSIGNABLE_ROLES;
    return ["PETUGAS"] as const;
  }, [operatorRole]);

  // Drop unselected optional selectors (null/"") before submit so the backend's
  // optional schema never sees a null (e.g. an ADMIN has no Team). Team is also
  // irrelevant for any non-PETUGAS role.
  const handleValid = (values: UserCreateValues | UserEditValues) => {
    const cleaned: Record<string, unknown> = { ...values };
    if (cleaned.rtuppName == null || cleaned.rtuppName === "") delete cleaned.rtuppName;
    if (!isPetugas || cleaned.teamName == null || cleaned.teamName === "") delete cleaned.teamName;
    onSubmit(cleaned as UserCreateValues | UserEditValues);
  };

  return (
    <form onSubmit={handleSubmit(handleValid)} className="space-y-4">
      {!isEdit && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField control={control as never} name="email" label="Email" required placeholder="user@pln.co.id" />
          <TextField control={control as never} name="password" label="Password Awal" required placeholder="min. 6 karakter" />
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField control={control as never} name="name" label="Nama" required />
        <TextField control={control as never} name="phone" label="No. HP" placeholder="08…" />
      </div>
      <SelectField control={control as never} name="role" label="Role" required options={toOptions(assignableRoles, ROLE_LABELS)} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField control={control as never} name="rtuppName" label="RTUPP" placeholder="Pilih RTUPP (opsional)" options={RTUPP_OPTIONS} />
        {isPetugas && (
          <SelectField control={control as never} name="teamName" label="Team" placeholder="Pilih Team" options={TEAM_OPTIONS} />
        )}
      </div>
      {isEdit && (
        <SwitchField
          control={control as never}
          name="isActive"
          label="Aktif"
          description={
            isMasterAccount
              ? "Akun Master tidak dapat dinonaktifkan"
              : "User aktif & bisa login"
          }
          disabled={isMasterAccount}
        />
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>Batal</Button>
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}Simpan
        </Button>
      </div>
    </form>
  );
}

// ── Team ──────────────────────────────────────────────────────────────────────
export const teamSchema = z.object({
  code: z.string().min(1, "Kode wajib diisi"),
  name: z.string().min(1, "Nama wajib diisi"),
  rtuppId: z.string().min(1, "RTUPP wajib dipilih"),
  isActive: z.boolean().optional(),
});
export type TeamValues = z.infer<typeof teamSchema>;

export function TeamForm({
  defaultValues,
  onSubmit,
  onCancel,
  submitting,
}: {
  defaultValues?: Partial<TeamValues>;
  onSubmit: (values: TeamValues) => void;
  onCancel: () => void;
  submitting?: boolean;
}) {
  const rtuppQ = useRtuppDropdown();
  const rtuppOptions: SelectOption[] = (rtuppQ.data ?? []).map((r) => ({ value: r.id, label: `${r.code} — ${r.name}` }));
  const form = useForm<TeamValues>({
    resolver: zodResolver(teamSchema),
    defaultValues: { code: "", name: "", rtuppId: "", isActive: true, ...defaultValues },
  });
  const { control, handleSubmit } = form;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField control={control} name="code" label="Kode" required placeholder="TEAM-01" />
        <TextField control={control} name="name" label="Nama" required />
      </div>
      <SelectField control={control} name="rtuppId" label="RTUPP" required placeholder="Pilih RTUPP" options={rtuppOptions} />
      <SwitchField control={control} name="isActive" label="Aktif" />

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>Batal</Button>
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}Simpan
        </Button>
      </div>
    </form>
  );
}

// ── RTUPP ─────────────────────────────────────────────────────────────────────
// region/address/phone are optional (string | undefined) to match the V1
// CreateRtuppInput/UpdateRtuppInput contract (no nulls).
export const rtuppSchema = z.object({
  code: z.string().min(1, "Kode wajib diisi"),
  name: z.string().min(1, "Nama wajib diisi"),
  region: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  isActive: z.boolean().optional(),
});
export type RtuppValues = z.infer<typeof rtuppSchema>;

export function RtuppForm({
  defaultValues,
  onSubmit,
  onCancel,
  submitting,
}: {
  defaultValues?: Partial<RtuppValues>;
  onSubmit: (values: RtuppValues) => void;
  onCancel: () => void;
  submitting?: boolean;
}) {
  const form = useForm<RtuppValues>({
    resolver: zodResolver(rtuppSchema),
    defaultValues: { code: "", name: "", region: undefined, address: undefined, phone: undefined, isActive: true, ...defaultValues },
  });
  const { control, handleSubmit } = form;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField control={control} name="code" label="Kode" required placeholder="RTUPP-JKT" />
        <TextField control={control} name="name" label="Nama" required />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField control={control} name="region" label="Region" />
        <TextField control={control} name="phone" label="Telepon" />
      </div>
      <TextField control={control} name="address" label="Alamat" />
      <SwitchField control={control} name="isActive" label="Aktif" />

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>Batal</Button>
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}Simpan
        </Button>
      </div>
    </form>
  );
}

// ── Personil ──────────────────────────────────────────────────────────────────
// Master pelaksana lapangan. RTUPP is fixed to the operator's own RTUPP for
// ADMIN (hidden, taken from the auth store) and chosen from a list for MASTER.
// The backend re-enforces the per-RTUPP scope.
export const personilSchema = z.object({
  nip: z.string().min(1, "NIP wajib diisi"),
  nama: z.string().min(1, "Nama wajib diisi"),
  jabatan: z.string().min(1, "Jabatan wajib diisi"),
  rtuppId: z.string().min(1, "RTUPP wajib dipilih"),
  isActive: z.boolean().optional(),
});
export type PersonilValues = z.infer<typeof personilSchema>;

export function PersonilForm({
  defaultValues,
  onSubmit,
  onCancel,
  submitting,
}: {
  defaultValues?: Partial<PersonilValues>;
  onSubmit: (values: PersonilValues) => void;
  onCancel: () => void;
  submitting?: boolean;
}) {
  const operatorRole = useV2Role();
  const isMasterOp = operatorRole === "MASTER";
  const currentUser = useAuthStore((s) => s.user);
  const rtuppQ = useRtuppDropdown();
  const rtuppOptions: SelectOption[] = (rtuppQ.data ?? []).map((r) => ({ value: r.id, label: `${r.code} — ${r.name}` }));

  const form = useForm<PersonilValues>({
    resolver: zodResolver(personilSchema),
    defaultValues: {
      nip: "",
      nama: "",
      jabatan: "",
      // ADMIN: pin to own RTUPP; MASTER: choose explicitly.
      rtuppId: isMasterOp ? "" : currentUser?.rtupp?.id ?? "",
      isActive: true,
      ...defaultValues,
    },
  });
  const { control, handleSubmit } = form;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField control={control} name="nip" label="NIP" required placeholder="mis. 9012345" />
        <TextField control={control} name="nama" label="Nama" required />
      </div>
      <TextField control={control} name="jabatan" label="Jabatan" required placeholder="mis. Teknisi SCADA" />
      {isMasterOp ? (
        <SelectField control={control} name="rtuppId" label="RTUPP" required placeholder="Pilih RTUPP" options={rtuppOptions} />
      ) : (
        <p className="text-xs text-muted-foreground">
          RTUPP: <span className="font-medium text-foreground">{currentUser?.rtupp?.name ?? "-"}</span>
        </p>
      )}
      <SwitchField control={control} name="isActive" label="Aktif" />

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>Batal</Button>
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}Simpan
        </Button>
      </div>
    </form>
  );
}

// ── Reset password ────────────────────────────────────────────────────────────
export const resetPasswordSchema = z.object({
  password: z.string().min(6, "Password minimal 6 karakter"),
});
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

export function ResetPasswordForm({
  onSubmit,
  onCancel,
  submitting,
}: {
  onSubmit: (values: ResetPasswordValues) => void;
  onCancel: () => void;
  submitting?: boolean;
}) {
  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "" },
  });
  const { control, handleSubmit } = form;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <TextField control={control} name="password" label="Password Sementara" required placeholder="min. 6 karakter" />
      <p className="text-xs text-muted-foreground">User akan diminta mengganti password ini saat login berikutnya.</p>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>Batal</Button>
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}Reset Password
        </Button>
      </div>
    </form>
  );
}
