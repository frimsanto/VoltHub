import { useEffect, useState } from "react";
import { useRouterState, useNavigate, Link } from "@tanstack/react-router";
import { useAuthStore } from "@/stores/auth";
import { Search, ChevronRight, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { resolveAvatarUrl } from "@/lib/api/auth";
import { Badge } from "@/components/ui/badge";
import { NotificationCenter } from "@/components/NotificationCenter";

const LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  laporan: "Laporan",
  create: "Buat Laporan",
  "laporan-awal": "Laporan Awal",
  "laporan-akhir": "Laporan Akhir",
  history: "History Laporan",
  monitoring: "Monitoring",
  validasi: "Validasi Laporan",
  export: "Export Data",
  users: "User Management",
  rtupp: "RTUPP Management",
  team: "Team Management",
  profile: "Profile",
};

export function Topbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const { user, logout } = useAuthStore();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [now, setNow] = useState(new Date());
  const [searchQuery, setSearchQuery] = useState("");

  // Redirect immediately — don't wait for the (fire-and-forget) server call.
  const handleLogout = () => {
    logout();
    navigate({ to: "/login", replace: true });
  };

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const segs = pathname.split("/").filter(Boolean);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate({ to: "/history", search: { search: searchQuery.trim() } });
    }
  };

  return (
    <>
      <header className="sticky top-0 z-20 h-14 bg-background/95 backdrop-blur-sm border-b border-border flex items-center gap-3 sm:gap-4 px-4 sm:px-6">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden rounded-xl shrink-0"
          aria-label="Buka menu navigasi"
          onClick={onMenuClick}
        >
          <Menu className="size-5" />
        </Button>
        <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
          <Link to="/dashboard" className="hover:text-foreground">
            VoltHub
          </Link>
          {segs.map((s) => (
            <span key={s} className="flex items-center gap-2">
              <ChevronRight className="size-3.5" />
              <span className="text-foreground font-medium truncate">{LABELS[s] ?? s}</span>
            </span>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <form onSubmit={handleSearch} className="relative hidden md:block w-72">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Cari laporan, gardu, petugas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 rounded-xl bg-muted/50 border-transparent"
            />
          </form>

          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-muted/60 text-xs font-medium tabular-nums">
            <span className="size-2 rounded-full bg-success animate-pulse" />
            {now.toLocaleString("id-ID", { weekday: "short", day: "2-digit", month: "short" })}
            <span className="text-muted-foreground">•</span>
            <span>{now.toLocaleTimeString("id-ID")}</span>
          </div>

          <ThemeToggle />

          <NotificationCenter />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-xl hover:bg-muted transition">
                <Avatar className="size-8">
                  {resolveAvatarUrl(user?.avatar) && (
                    <AvatarImage src={resolveAvatarUrl(user?.avatar)} alt={user?.name ?? "User"} />
                  )}
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                    {user?.name
                      ?.split(" ")
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join("") ?? "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden sm:block text-left">
                  <div className="text-xs font-semibold leading-tight">{user?.name}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    {user?.role}
                  </div>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="font-semibold">{user?.name}</div>
                <div className="text-xs text-muted-foreground font-normal">{user?.email}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/profile">Profile saya</Link>
              </DropdownMenuItem>
              <DropdownMenuItem>Pengaturan</DropdownMenuItem>
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                RTUPP{" "}
                <Badge variant="secondary" className="ml-1">
                  {user?.rtupp?.name ?? "-"}
                </Badge>
                {user?.team?.name && (
                  <>
                    <br />
                    Team{" "}
                    <Badge variant="secondary" className="ml-1">
                      {user?.team.name}
                    </Badge>
                  </>
                )}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
    </>
  );
}
