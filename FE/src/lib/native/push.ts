import { Capacitor } from "@capacitor/core";
import {
  PushNotifications,
  type PushNotificationSchema,
  type ActionPerformed,
} from "@capacitor/push-notifications";
import apiClient from "@/lib/api/client";
import { getPlatform } from "@/lib/appVersion";
import { NOTIFICATION_TYPES, type NotificationType } from "@/features/v2/notifications/api";
import { resolveNotificationLink } from "@/features/v2/notifications/links";

let initialized = false;
let registeredToken: string | null = null;

/**
 * Push registration requires a configured Firebase project on Android
 * (`android/app/google-services.json`) and an APNs key on iOS. WITHOUT it,
 * calling `PushNotifications.register()` makes the native plugin invoke
 * `FirebaseMessaging.getInstance().getToken()`, which throws
 * `IllegalStateException: Default FirebaseApp is not initialized in this
 * process` on the native main thread. That native exception is raised AFTER our
 * async `register()` call returns, so the JS try/catch below cannot catch it —
 * the process crashes and the app exits the moment notification permission is
 * granted.
 *
 * Until an FCM project is provisioned, push must stay disabled at build time.
 * Set `VITE_PUSH_ENABLED=true` in the environment only once
 * `google-services.json` ships inside the Android project (and the iOS APNs
 * entitlement is configured). When false/absent we never call `register()`, so
 * permission can be granted safely and the app keeps running.
 */
const PUSH_ENABLED = import.meta.env.VITE_PUSH_ENABLED === "true";

/**
 * Deep-link handler. The app registers a navigator (e.g. TanStack Router's
 * `navigate`) so a notification tap can open the relevant report. Kept as a
 * callback so this native module doesn't import the router directly.
 */
type Navigate = (path: string) => void;
let navigate: Navigate | null = null;
export function setPushNavigator(nav: Navigate): void {
  navigate = nav;
}

/**
 * Map a notification's `data` payload to an in-app path.
 *
 * Two producers send push data:
 *   1. Legacy report push (laporanAwal/AkhirService): `{ type: 'laporan-awal' |
 *      'laporan-akhir', id, status }`.
 *   2. The notification system queue (BE modules/notifications): `{ type:
 *      <EVENT_TYPE>, entityType, entityId, notificationId, ... }` — resolved by
 *      the shared resolveNotificationLink so web + native stay in lock-step.
 */
export function resolveDeepLink(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  const { type, id } = data as { type?: string; id?: string };

  // (1) Legacy report push shape.
  if (type === "laporan-awal" && id) return `/laporan-awal/${id}`;
  if (type === "laporan-akhir" && id) return `/laporan-akhir/${id}`;

  // (2) Notification-system shape — reuse the shared resolver.
  if (type && NOTIFICATION_TYPES.includes(type as NotificationType)) {
    return resolveNotificationLink({
      type: type as NotificationType,
      entityType: (data.entityType as string | undefined) ?? null,
      entityId: (data.entityId as string | undefined) ?? null,
      data,
    });
  }
  return null;
}

const ANDROID_CHANNEL_ID = "voltreport-default";

/** Create the Android notification channel (Android 8+ requires one). No-op elsewhere. */
async function ensureAndroidChannel(): Promise<void> {
  if (getPlatform() !== "android") return;
  try {
    await PushNotifications.createChannel({
      id: ANDROID_CHANNEL_ID,
      name: "Notifikasi VoltHub",
      description: "Status validasi laporan (disetujui, revisi, ditolak)",
      importance: 5, // HIGH — heads-up notification
      visibility: 1, // PUBLIC on lock screen
      vibration: true,
    });
  } catch {
    /* channel creation is best-effort */
  }
}

/**
 * Register the device for push notifications (native only) and send the FCM/APNs
 * token to the backend. No-op on web. Safe to call multiple times — guarded.
 *
 * Handles: permission prompt, Android channel, token registration + refresh,
 * registration errors, foreground delivery, and notification-tap deep links.
 */
export async function initPush(): Promise<void> {
  if (initialized || !Capacitor.isNativePlatform()) return;

  // Hard gate: without a provisioned FCM/APNs project, register() crashes the
  // native process (see PUSH_ENABLED note above). Stay a no-op so the app runs.
  if (!PUSH_ENABLED) {
    console.info(
      "[push] disabled (VITE_PUSH_ENABLED!=true / no FCM project) — skipping registration",
    );
    return;
  }

  initialized = true;

  try {
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== "granted") {
      initialized = false;
      return;
    }

    await ensureAndroidChannel();

    // Fired on first registration AND whenever FCM rotates the token. Re-posting
    // the new token to the backend keeps the device_tokens table fresh (the
    // backend upserts by token), so token refresh is handled automatically.
    PushNotifications.addListener("registration", async (token) => {
      registeredToken = token.value;
      try {
        await apiClient.post("/push/register", {
          token: token.value,
          platform: getPlatform(),
        });
      } catch {
        /* will retry on next app launch */
      }
    });

    // Surface registration failures (e.g. missing google-services.json) so they
    // can be reported instead of silently dropped.
    PushNotifications.addListener("registrationError", (err) => {
      initialized = false;
      console.error("[push] registration error:", err?.error ?? err);
    });

    // Foreground delivery: by default Android suppresses the system tray banner
    // while the app is open. Log it; the in-app UI (React Query refetch / toast)
    // reflects the status change. Hook a toast here if desired.
    PushNotifications.addListener(
      "pushNotificationReceived",
      (notification: PushNotificationSchema) => {
        console.log("[push] foreground:", notification.title, notification.body);
      },
    );

    // Notification tapped (app in background/quit): deep-link to the report.
    PushNotifications.addListener("pushNotificationActionPerformed", (action: ActionPerformed) => {
      const path = resolveDeepLink(action.notification?.data);
      if (path && navigate) navigate(path);
    });

    await PushNotifications.register();
  } catch {
    initialized = false;
  }
}

/**
 * Remove the device token from the backend and tear down listeners. Call on
 * logout so a shared device stops receiving the previous user's notifications.
 */
export async function teardownPush(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    if (registeredToken) {
      try {
        await apiClient.post("/push/unregister", { token: registeredToken });
      } catch {
        /* best-effort */
      }
      registeredToken = null;
    }
    await PushNotifications.removeAllListeners();
    initialized = false;
  } catch {
    /* ignore */
  }
}
