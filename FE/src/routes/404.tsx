import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Home, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/404")({
  component: NotFound,
  head: () => ({ meta: [{ title: "404 — Page Not Found — VoltHub" }] }),
});

function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full shadow-soft border-border/60">
        <CardContent className="p-8 text-center">
          <div className="text-8xl font-bold text-primary/20 mb-4">404</div>
          <h1 className="text-2xl font-bold mb-2">Halaman Tidak Ditemukan</h1>
          <p className="text-muted-foreground mb-6">
            Maaf, halaman yang Anda cari tidak dapat ditemukan atau telah dipindahkan.
          </p>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" onClick={() => navigate({ to: "/" })} className="gap-2">
              <Home className="size-4" />
              Beranda
            </Button>
            <Button onClick={() => window.history.back()} className="gap-2">
              <ArrowLeft className="size-4" />
              Kembali
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
