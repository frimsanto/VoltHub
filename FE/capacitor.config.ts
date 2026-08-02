import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  // appId is the native package identity (Play Store / signing). Changing it
  // would break installs and store listings, so it stays as-is intentionally.
  appId: "id.pln.voltreport",
  appName: "VoltHub",
  // Capacitor serves the production web build from this folder. Run
  // `npm run build` before `npx cap sync`.
  webDir: "dist",
  backgroundColor: "#0b5cab",
  android: {
    // Allow http to a self-hosted API during rollout; switch to https-only
    // before publishing to the Play Store.
    allowMixedContent: true,
  },
  server: {
    androidScheme: "https",
  },
  plugins: {
    // Edge-to-edge: WebView draws under a transparent status bar. The app
    // supplies its own safe-area padding (see styles.css / .pt-safe). The bar
    // icon colour is synced to the theme at runtime (lib/native/bootstrap.ts).
    StatusBar: {
      overlaysWebView: true,
      style: "DEFAULT",
      backgroundColor: "#00000000",
    },
    // We manage the keyboard inset in JS (useKeyboardInset) and lift sticky UI
    // ourselves, so the WebView itself must not resize/jump.
    Keyboard: {
      resize: "none",
      resizeOnFullScreen: true,
    },
    // Brief branded launch screen; hidden by the app once mounted
    // (lib/native/bootstrap.ts → hideSplash).
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: "#0b5cab",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
    },
  },
};

export default config;
