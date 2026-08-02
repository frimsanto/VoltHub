import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { secureStorage } from "@/lib/secureStorage";
import { setSentryUser } from "@/lib/sentry";
import { applyTheme } from "@/lib/theme";

// Frontend role model (stored lowercase). VoltHub's canonical hierarchy maps
// onto this: MASTER folds into `superadmin` (same top-tier access in the
// legacy V1 guards), MANAGER is its own read-only tier, ADMIN/ADMIN_RTUPP →
// admin, NOC is the control-room SCADA-upload/monitoring tier, everything else
// → petugas. The V2 layer re-derives MASTER/MANAGER/NOC from this via
// lib/v2/rbac.toV2Role (superadmin→MASTER, manager→MANAGER, noc→NOC).
export type Role = "petugas" | "admin" | "manager" | "superadmin" | "noc";

// Normalize the raw backend role string into the frontend Role.
export function normalizeRole(role: string): Role {
  const lower = role.toLowerCase();
  // MASTER (canonical system owner) shares the top tier with legacy SUPERADMIN.
  if (lower === "master" || lower === "superadmin" || lower === "super_admin") return "superadmin";
  // MANAGER is the read-only monitoring tier (no legacy equivalent).
  if (lower === "manager") return "manager";
  // NOC — control-room operator (SCADA upload + monitoring, not RTUPP-bound).
  if (lower === "noc") return "noc";
  // Legacy ADMIN_RTUPP is collapsed into the canonical ADMIN role.
  if (lower === "admin" || lower === "admin_rtupp") return "admin";
  if (lower === "petugas") return "petugas";
  return "petugas"; // Default fallback (least privilege)
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  avatar: string | null;
  isActive: boolean;
  mustChangePassword?: boolean;
  rtupp?: {
    id: string;
    code: string;
    name: string;
  } | null;
  team?: {
    id: string;
    code: string;
    name: string;
  } | null;
}

// The backend sends the user with a raw uppercase role string; the store
// normalizes it on login, so the action accepts a string role rather than the
// strict Role union.
export type LoginUserInput = Omit<User, "role"> & { role: string };

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthed: boolean;
  isLoading: boolean;
  theme: "light" | "dark";
  sidebarCollapsed: boolean;

  // Actions
  // Accepts the raw backend user (role is an uppercase string); the role is
  // normalized to the frontend Role union inside the action.
  login: (user: LoginUserInput, tokens: { accessToken: string; refreshToken: string }) => void;
  logout: () => void;
  setAccessToken: (token: string) => void;
  setRefreshToken: (token: string) => void;
  setUser: (user: User) => void;
  updateProfile: (patch: Partial<User>) => void;

  // UI
  toggleTheme: () => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthed: false,
      isLoading: false,
      theme: "light",
      sidebarCollapsed: false,

      login: (userData, tokens) => {
        // Normalize role from backend (uppercase) to frontend (lowercase)
        const normalizedUser: User = {
          ...userData,
          role: normalizeRole(userData.role),
        };

        set({
          user: normalizedUser,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          isAuthed: true,
          isLoading: false,
        });

        // Tag Sentry events with the logged-in user (no-op when Sentry disabled).
        setSentryUser({
          id: normalizedUser.id,
          email: normalizedUser.email,
          role: normalizedUser.role,
        });

        // Apply theme class
        if (typeof document !== "undefined") {
          document.documentElement.classList.toggle("dark", get().theme === "dark");
        }
      },

      logout: () => {
        const rt = get().refreshToken;

        // Clear session state FIRST and synchronously — this is what the
        // /_app route guard reacts to redirect to /login. Everything below is
        // best-effort cleanup and must never block or delay that.
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthed: false,
          isLoading: false,
        });

        localStorage.removeItem("voltreport-auth");

        // Detach the user from the Sentry scope.
        setSentryUser(null);

        // Cancel any requests still in flight so a late response can't act on
        // stale state after the session is already gone. Dynamic import
        // avoids a circular dependency with the api client.
        void import("@/lib/api/client")
          .then((m) => m.abortPendingRequests())
          .catch(() => {
            /* best-effort */
          });

        // Best-effort server-side revocation of this device's session so the
        // refresh token can't be rotated after logout. Fire-and-forget.
        if (rt) {
          void import("@/lib/api/auth")
            .then((m) => m.logoutServer(rt, "single"))
            .catch(() => {
              /* network/offline — token still cleared locally above */
            });
        }
      },

      setAccessToken: (token) => {
        set({ accessToken: token });
      },

      // The backend rotates refresh tokens: every /auth/refresh returns a fresh
      // refresh token and revokes the previous one. We MUST persist the new one,
      // or the next refresh would present a revoked token and force a re-login.
      setRefreshToken: (token) => {
        set({ refreshToken: token });
      },

      setUser: (user) => {
        set({ user });
      },

      updateProfile: (patch) => {
        const current = get().user;
        if (current) {
          set({ user: { ...current, ...patch } });
        }
      },

      toggleTheme: () => {
        const next = get().theme === "light" ? "dark" : "light";
        set({ theme: next });
        if (typeof document !== "undefined") {
          // Persist ke lib/theme (volthub_theme) — tanpa ini pilihan user kalah
          // oleh resolveTheme() pada load berikutnya.
          applyTheme(next);
        }
      },

      toggleSidebar: () => {
        set({ sidebarCollapsed: !get().sidebarCollapsed });
      },

      setSidebarCollapsed: (collapsed) => {
        set({ sidebarCollapsed: collapsed });
      },
    }),
    {
      name: "voltreport-auth",
      storage: createJSONStorage(() => secureStorage),
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthed: state.isAuthed,
        theme: state.theme,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    },
  ),
);

// Re-export for backwards compatibility
export const useAuth = useAuthStore;
