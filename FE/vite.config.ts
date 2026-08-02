import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { sentryVitePlugin } from "@sentry/vite-plugin";

// Upload source maps to Sentry only when the build has the required secrets
// (CI/production). Without them this plugin is omitted and the build is
// unaffected — local/dev builds never touch Sentry.
const sentryEnabled =
  !!process.env.SENTRY_AUTH_TOKEN && !!process.env.SENTRY_ORG && !!process.env.SENTRY_PROJECT;

export default defineConfig({
  build: {
    // Emit "hidden" source maps (generated, but no //# sourceMappingURL comment
    // in the bundle) only when uploading to Sentry — the plugin deletes the .map
    // files after upload. Without Sentry, no maps are shipped (source stays
    // private). Flip to "hidden" temporarily if you need local map debugging.
    sourcemap: sentryEnabled ? "hidden" : false,
    rollupOptions: {
      output: {
        // Split the heaviest charting vendor into its own chunk so the main app
        // bundle stays under the PWA precache size limit (2 MiB) and continues to
        // be cached for offline use. recharts (+ its d3 deps) is the dominant
        // weight; isolating it keeps the entry chunk comfortably below the cap.
        // (rolldown-vite requires manualChunks as a function, not an object.)
        manualChunks: (id: string) =>
          /node_modules\/(recharts|d3-|victory-vendor|internmap)/.test(id) ? "recharts" : undefined,
      },
    },
  },
  plugins: [
    tsconfigPaths(),
    TanStackRouterVite(),
    tailwindcss(),
    react(),
    VitePWA({
      // "autoUpdate": once a new build is deployed, the new SW takes over and
      // reloads open tabs automatically (see PWAUpdatePrompt) instead of
      // waiting indefinitely for a manual "Perbarui" click. Stale JS bundles
      // bake in a stale VITE_API_URL, which previously caused post-login
      // redirects to keep hitting the old API host until a hard refresh.
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icon.svg"],
      manifest: {
        name: "VoltHub — Monitoring System",
        short_name: "VoltHub",
        description: "Sistem pelaporan lapangan PLN",
        lang: "id",
        theme_color: "#0b5cab",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "/icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        // The main chunk crossed workbox's 2 MiB precache default (motion +
        // lenis for the premium UI); without this the whole build fails.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        // Cache the app shell; API calls are handled by our own offline queue,
        // so we only network-first the API to avoid serving stale data.
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
        // SPA routing: unmatched navigations fall back to the (precached)
        // shell instead of a 404, while /api stays excluded so it never
        // resolves to index.html.
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api/],
        // Drop caches left behind by previous SW versions on activation so a
        // stale build's assets can never be served after an update.
        cleanupOutdatedCaches: true,
        // Let a newly installed SW activate immediately and take control of
        // already-open tabs, instead of staying "waiting" until every tab
        // referencing the old SW is closed.
        skipWaiting: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api"),
            handler: "NetworkOnly",
          },
        ],
      },
      devOptions: {
        // Keep the SW off during `vite dev` to avoid stale-cache confusion.
        enabled: false,
      },
    }),
    // Keep last so it runs after the bundle (incl. source maps) is produced.
    ...(sentryEnabled
      ? [
          sentryVitePlugin({
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            authToken: process.env.SENTRY_AUTH_TOKEN,
            release: { name: process.env.VITE_SENTRY_RELEASE },
            sourcemaps: {
              // Remove emitted .map files from the deployed bundle after upload.
              filesToDeleteAfterUpload: ["**/*.map"],
            },
          }),
        ]
      : []),
  ],
  server: {
    port: 5173,
    strictPort: true,
  },
});
