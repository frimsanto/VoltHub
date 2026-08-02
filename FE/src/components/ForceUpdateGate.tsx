import { useEffect, useState } from "react";
import { AlertTriangle, Download } from "lucide-react";
import apiClient, { onForceUpdate } from "@/lib/api/client";
import { APP_VERSION, getPlatform } from "@/lib/appVersion";
import { Button } from "@/components/ui/button";

interface VersionInfo {
  minVersion: string;
  latestVersion: string;
  updateUrl: { android: string; ios: string };
}

function isBelow(version: string, min: string): boolean {
  const a = version.split(".").map((n) => parseInt(n, 10) || 0);
  const b = min.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) < (b[i] || 0)) return true;
    if ((a[i] || 0) > (b[i] || 0)) return false;
  }
  return false;
}

/**
 * Blocks the whole app when the client is older than the backend's minimum
 * supported version. Triggered either proactively (probing /version on mount)
 * or reactively (any API call returning 426 via onForceUpdate).
 */
export function ForceUpdateGate() {
  const [blocked, setBlocked] = useState(false);
  const [info, setInfo] = useState<VersionInfo | null>(null);

  useEffect(() => {
    onForceUpdate(() => setBlocked(true));

    let cancelled = false;
    apiClient
      .get("/version")
      .then((res) => {
        const data = res.data?.data as VersionInfo | undefined;
        if (cancelled || !data) return;
        setInfo(data);
        if (isBelow(APP_VERSION, data.minVersion)) setBlocked(true);
      })
      .catch(() => {
        /* offline or server down — don't block; normal flow continues */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!blocked) return null;

  const platform = getPlatform();
  const url =
    platform === "ios" ? info?.updateUrl.ios : info?.updateUrl.android;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-background/95 px-6 backdrop-blur">
      <div className="max-w-sm text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
          <AlertTriangle className="size-7" />
        </div>
        <h1 className="mt-4 text-xl font-semibold">Perbarui Aplikasi</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Versi Anda ({APP_VERSION}) sudah tidak didukung. Perbarui ke versi
          terbaru{info ? ` (${info.latestVersion})` : ""} untuk melanjutkan.
        </p>
        {url && (
          <Button asChild className="mt-6 w-full">
            <a href={url} target="_blank" rel="noreferrer">
              <Download className="mr-2 size-4" /> Perbarui Sekarang
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}
