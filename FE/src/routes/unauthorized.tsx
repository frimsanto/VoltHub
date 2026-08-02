import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldAlert, LogOut, Home } from "lucide-react";
import { useAuthStore } from "@/stores/auth";

export const Route = createFileRoute("/unauthorized")({
  component: Unauthorized,
  head: () => ({ meta: [{ title: "Unauthorized — VoltHub" }] }),
});

function Unauthorized() {
  const navigate = useNavigate();
  const { logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    navigate({ to: "/login" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full shadow-soft border-border/60">
        <CardContent className="p-8 text-center">
          <div className="size-20 mx-auto mb-4 rounded-full bg-destructive/10 flex items-center justify-center">
            <ShieldAlert className="size-10 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Akses Ditolak</h1>
          <p className="text-muted-foreground mb-6">
            Anda tidak memiliki izin untuk mengakses halaman ini. Silakan login kembali atau hubungi
            administrator jika Anda merasa ini adalah kesalahan.
          </p>
          <div className="flex gap-2 justify-center flex-wrap">
            <Button variant="outline" onClick={() => navigate({ to: "/" })} className="gap-2">
              <Home className="size-4" />
              Beranda
            </Button>
            <Button onClick={handleLogout} className="gap-2">
              <LogOut className="size-4" />
              Logout
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
