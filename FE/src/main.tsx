import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";

import { getRouter } from "./router";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { initSentry } from "./lib/sentry";
import { initNativeShell } from "./lib/native/bootstrap";
import { resolveTheme } from "./lib/theme";
import "./styles.css";
import "./styles/animations.css";

// Initialise error monitoring as early as possible (no-op without a DSN).
initSentry();

// Tema Opsi C: preferensi tersimpan menang, tanpa preferensi ikuti perangkat
// (prefers-color-scheme). Resolved before React mounts so the first paint is
// already correct (no flash); ThemeBoot then mirrors it into the store/native
// status bar.
const isDark = resolveTheme() === "dark";
document.documentElement.classList.toggle("dark", isDark);

// Native shell setup (status bar, splash, keyboard) — no-op on the web build.
void initNativeShell(isDark);

const router = getRouter();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  </React.StrictMode>,
);
