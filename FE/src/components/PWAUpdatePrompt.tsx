import { useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

/**
 * Registers the SW and, once a new version is detected (registerType:
 * "autoUpdate"), applies it immediately — skipWaiting + reload — instead of
 * waiting for a manual click. A stale SW previously kept serving an old JS
 * bundle (with a stale baked-in VITE_API_URL) after deploys, so post-login
 * redirects could keep hitting the wrong API host until a hard refresh.
 * Also surfaces a brief "offline ready" hint once the app shell is cached.
 */
export function PWAUpdatePrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    if (needRefresh) {
      updateServiceWorker(true);
    }
  }, [needRefresh, updateServiceWorker]);

  if (!offlineReady) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] max-w-sm rounded-xl border bg-background p-4 shadow-lg">
      <p className="text-sm">Aplikasi siap digunakan secara offline.</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="text-sm text-muted-foreground underline underline-offset-2"
          onClick={() => setOfflineReady(false)}
        >
          Tutup
        </button>
      </div>
    </div>
  );
}
