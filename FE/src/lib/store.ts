import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Role = "petugas" | "admin" | "superadmin";

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  rtupp: string;
  team: string;
  avatar?: string;
  status: "active" | "inactive";
}

interface AuthState {
  user: User | null;
  isAuthed: boolean;
  theme: "light" | "dark";
  sidebarCollapsed: boolean;
  login: (email: string, role?: Role) => void;
  logout: () => void;
  setRole: (role: Role) => void;
  toggleTheme: () => void;
  toggleSidebar: () => void;
  updateProfile: (patch: Partial<User>) => void;
}

const demoUsers: Record<Role, User> = {
  petugas: {
    id: "u-001",
    name: "Budi Santoso",
    email: "budi.santoso@pln.co.id",
    phone: "081234567890",
    role: "petugas",
    rtupp: "RTUPP Jakarta Selatan",
    team: "Team Alpha-1",
    status: "active",
  },
  admin: {
    id: "u-002",
    name: "Rina Hartati",
    email: "rina.hartati@pln.co.id",
    phone: "081298765432",
    role: "admin",
    rtupp: "RTUPP Jakarta Pusat",
    team: "Supervisor Pusat",
    status: "active",
  },
  superadmin: {
    id: "u-003",
    name: "Agus Wibowo",
    email: "agus.wibowo@pln.co.id",
    phone: "081200001111",
    role: "superadmin",
    rtupp: "RTUPP Distribusi DKI",
    team: "Operasional Pusat",
    status: "active",
  },
};

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthed: false,
      theme: "light",
      sidebarCollapsed: false,
      login: (email, role = "petugas") => {
        const lower = email.toLowerCase();
        const inferred: Role = lower.includes("super")
          ? "superadmin"
          : lower.includes("admin")
            ? "admin"
            : role;
        const u = { ...demoUsers[inferred], email: email || demoUsers[inferred].email };
        set({ user: u, isAuthed: true });
      },
      logout: () => set({ user: null, isAuthed: false }),
      setRole: (role) => {
        const current = get().user;
        const base = demoUsers[role];
        set({
          user: current ? { ...current, role, rtupp: base.rtupp, team: base.team } : base,
          isAuthed: true,
        });
      },
      toggleTheme: () => {
        const next = get().theme === "light" ? "dark" : "light";
        set({ theme: next });
        if (typeof document !== "undefined") {
          document.documentElement.classList.toggle("dark", next === "dark");
        }
      },
      toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
      updateProfile: (patch) => set({ user: get().user ? { ...get().user!, ...patch } : null }),
    }),
    { name: "voltreport-auth" },
  ),
);
