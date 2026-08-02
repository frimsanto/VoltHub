// VoltHub — Administration hooks.
// Users/Teams/RTUPP have no V2 (/api/v1) module — they are managed by the existing
// V1 admin endpoints (/api/users, /api/teams, /api/rtupp). These hooks wrap the
// existing V1 API clients in TanStack Query so the VoltHub admin pages get the
// same toasts/invalidation UX as the rest of V2. No backend/RBAC change.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { handleError } from "@/lib/api/client";
import {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  resetUserPassword,
  getRtuppList,
  getTeamList,
  type CreateUserInput,
  type UpdateUserInput,
} from "@/lib/api/users";
import {
  getTeams,
  createTeam,
  updateTeam,
  deleteTeam,
  type CreateTeamInput,
  type UpdateTeamInput,
} from "@/lib/api/teams";
import {
  getRtupps,
  createRtupp,
  updateRtupp,
  deleteRtupp,
  type CreateRtuppInput,
  type UpdateRtuppInput,
} from "@/lib/api/rtupp";
import {
  getPersonil,
  createPersonil,
  updatePersonil,
  deletePersonil,
  type CreatePersonilInput,
  type UpdatePersonilInput,
} from "@/lib/api/personil";

const keys = {
  users: (p?: unknown) => ["v2-admin-users", p ?? {}] as const,
  teams: (p?: unknown) => ["v2-admin-teams", p ?? {}] as const,
  rtupps: (p?: unknown) => ["v2-admin-rtupps", p ?? {}] as const,
  dropdownRtupp: ["v2-admin-dropdown-rtupp"] as const,
};

// ── Users ─────────────────────────────────────────────────────────────────────
export function useUsers(params?: { search?: string; role?: string }) {
  return useQuery({ queryKey: keys.users(params), queryFn: () => getUsers(params) });
}
export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateUserInput) => createUser(body),
    onSuccess: () => {
      toast.success("User dibuat");
      qc.invalidateQueries({ queryKey: ["v2-admin-users"] });
    },
    onError: (e) => toast.error(handleError(e as never)),
  });
}
export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateUserInput }) => updateUser(id, body),
    onSuccess: () => {
      toast.success("User diperbarui");
      qc.invalidateQueries({ queryKey: ["v2-admin-users"] });
    },
    onError: (e) => toast.error(handleError(e as never)),
  });
}
export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => {
      toast.success("User dihapus");
      qc.invalidateQueries({ queryKey: ["v2-admin-users"] });
    },
    onError: (e) => toast.error(handleError(e as never)),
  });
}
export function useResetUserPassword() {
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) => resetUserPassword(id, password),
    onSuccess: () => toast.success("Password di-reset (user wajib ganti saat login)"),
    onError: (e) => toast.error(handleError(e as never)),
  });
}

// Dropdowns (RTUPP + Team) for the user form.
export function useRtuppDropdown() {
  return useQuery({ queryKey: keys.dropdownRtupp, queryFn: () => getRtuppList() });
}
export function useTeamDropdown() {
  return useQuery({ queryKey: ["v2-admin-dropdown-team"], queryFn: () => getTeamList() });
}

// ── Teams ─────────────────────────────────────────────────────────────────────
export function useTeams(params?: { search?: string; rtuppId?: string }) {
  return useQuery({ queryKey: keys.teams(params), queryFn: () => getTeams(params) });
}
export function useCreateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTeamInput) => createTeam(body),
    onSuccess: () => {
      toast.success("Team dibuat");
      qc.invalidateQueries({ queryKey: ["v2-admin-teams"] });
    },
    onError: (e) => toast.error(handleError(e as never)),
  });
}
export function useUpdateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateTeamInput }) => updateTeam(id, body),
    onSuccess: () => {
      toast.success("Team diperbarui");
      qc.invalidateQueries({ queryKey: ["v2-admin-teams"] });
    },
    onError: (e) => toast.error(handleError(e as never)),
  });
}
export function useDeleteTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTeam(id),
    onSuccess: () => {
      toast.success("Team dihapus");
      qc.invalidateQueries({ queryKey: ["v2-admin-teams"] });
    },
    onError: (e) => toast.error(handleError(e as never)),
  });
}

// ── RTUPP ─────────────────────────────────────────────────────────────────────
export function useRtupps(params?: { search?: string }) {
  return useQuery({ queryKey: keys.rtupps(params), queryFn: () => getRtupps(params) });
}
export function useCreateRtupp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateRtuppInput) => createRtupp(body),
    onSuccess: () => {
      toast.success("RTUPP dibuat");
      qc.invalidateQueries({ queryKey: ["v2-admin-rtupps"] });
    },
    onError: (e) => toast.error(handleError(e as never)),
  });
}
export function useUpdateRtupp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateRtuppInput }) => updateRtupp(id, body),
    onSuccess: () => {
      toast.success("RTUPP diperbarui");
      qc.invalidateQueries({ queryKey: ["v2-admin-rtupps"] });
    },
    onError: (e) => toast.error(handleError(e as never)),
  });
}
export function useDeleteRtupp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteRtupp(id),
    onSuccess: () => {
      toast.success("RTUPP dihapus");
      qc.invalidateQueries({ queryKey: ["v2-admin-rtupps"] });
    },
    onError: (e) => toast.error(handleError(e as never)),
  });
}

// ── Personil ────────────────────────────────────────────────────────────────
// Master pelaksana lapangan, scoped per-RTUPP server-side (ADMIN sees/manages
// only its own RTUPP; MASTER all). Invalidates both the admin list and the
// laporan-awal personil selector cache (queryKey ["personil", ...]).
export function usePersonil(params?: { search?: string; rtuppId?: string }) {
  return useQuery({ queryKey: ["v2-admin-personil", params ?? {}], queryFn: () => getPersonil(params) });
}
function invalidatePersonil(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["v2-admin-personil"] });
  qc.invalidateQueries({ queryKey: ["personil"] });
}
export function useCreatePersonil() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreatePersonilInput) => createPersonil(body),
    onSuccess: () => {
      toast.success("Personil ditambahkan");
      invalidatePersonil(qc);
    },
    onError: (e) => toast.error(handleError(e as never)),
  });
}
export function useUpdatePersonil() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdatePersonilInput }) => updatePersonil(id, body),
    onSuccess: () => {
      toast.success("Personil diperbarui");
      invalidatePersonil(qc);
    },
    onError: (e) => toast.error(handleError(e as never)),
  });
}
export function useDeletePersonil() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deletePersonil(id),
    onSuccess: () => {
      toast.success("Personil dihapus");
      invalidatePersonil(qc);
    },
    onError: (e) => toast.error(handleError(e as never)),
  });
}
