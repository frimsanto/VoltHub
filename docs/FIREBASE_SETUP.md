# VoltReport — Firebase Cloud Messaging (Production Setup)

> End-to-end push-notification setup for the VoltReport Android app. Push is
> **best-effort**: the entire backend and app run normally with push disabled
> (`FCM_SERVER_KEY` empty). Pairs with [`ANDROID_RELEASE.md`](./ANDROID_RELEASE.md)
> and [`FE/MOBILE.md`](../FE/MOBILE.md).

---

## 0. How push works in VoltReport

```
Validator approves/rejects a report
        │  (BE laporanAwalService / laporanAkhirService)
        ▼
  sendToUser(ownerId, { title, body, data:{ type, id, status } })
        │  pushService.ts → POST https://fcm.googleapis.com/fcm/send
        ▼
      FCM  ──────────────►  Android device (token in device_tokens)
        │                         │
        │                    pushNotificationReceived (foreground)
        │                    pushNotificationActionPerformed (tap → deep link)
        ▼
  invalid tokens (NotRegistered) pruned from device_tokens
```
- **Token registration:** on login the app calls `initPush()` →
  `POST /api/push/register { token, platform }` → upserted into `device_tokens`
  ([`BE/src/services/pushService.ts`](../BE/src/services/pushService.ts)).
- **Token refresh:** the Capacitor `registration` listener fires again when FCM
  rotates the token; the app re-posts it (backend upserts by token).
- **Token invalidation:** on logout the app calls `POST /api/push/unregister`;
  the backend also prunes tokens FCM reports as `NotRegistered`/`InvalidRegistration`.

---

## 1. Audit findings

### ✅ Present
- Backend FCM sender with graceful disable when `FCM_SERVER_KEY` is empty, dead-token pruning ([`pushService.ts`](../BE/src/services/pushService.ts)).
- `device_tokens` table + migration (`20260602120000_add_device_tokens`), unique on `token`, cascade-delete with the user.
- Register/unregister endpoints (auth-protected) ([`pushRoutes.ts`](../BE/src/routes/pushRoutes.ts)).
- App-side registration + token-refresh re-post ([`FE/src/lib/native/push.ts`](../FE/src/lib/native/push.ts)).
- `@capacitor/push-notifications` v8 installed.

### ⚠️ Gaps found — and fixed in this phase
| Gap | Fix |
|---|---|
| No Android **notification channel** (required Android 8+; without it heads-up notifications are silent) | Added `ensureAndroidChannel()` creating channel `voltreport-default` (HIGH importance) in `push.ts` |
| No **foreground** notification handling | Added `pushNotificationReceived` listener (logs; toast hook point) |
| No **notification-tap / deep link** | Added `pushNotificationActionPerformed` → `resolveDeepLink(data)` → `setPushNavigator()` callback opens `/laporan-awal/:id` or `/laporan-akhir/:id` |
| No **registrationError** handling (e.g. missing `google-services.json` failed silently) | Added `registrationError` listener (logs + resets state) |
| Logout left the device token registered server-side (shared devices kept receiving prior user's notifications) | `teardownPush()` now calls `/push/unregister` for the stored token |

> **Wiring required (app):** call `setPushNavigator(navigate)` once at app
> startup (where the router is available) so taps can deep-link. `initPush()` is
> already called on login and `teardownPush()` on logout.

### ⚠️ Remaining gap (infra decision, not code)
| Gap | Recommendation |
|---|---|
| Backend uses the **legacy FCM HTTP API** (`/fcm/send` + `FCM_SERVER_KEY`) which Google has **deprecated** | Plan migration to **FCM HTTP v1** (OAuth2 service-account, `messages:send`). The current path still works for now but should be migrated post-go-live; it is the only push debt remaining. |

---

## 2. Firebase project setup

1. [Firebase console](https://console.firebase.google.com) → **Add project** →
   name `VoltReport` (or reuse a PLN org project). Disable Google Analytics unless needed.
2. **Add app → Android.**
   - **Android package name:** `id.pln.voltreport` (must exactly match `appId`
     in [`capacitor.config.ts`](../FE/capacitor.config.ts) / `applicationId` in `build.gradle`).
   - **App nickname:** `VoltReport Android`.
   - **Debug signing SHA-1:** add now (see §3); SHA-256 too if using App Links.
3. Use **separate Firebase projects (or at least separate apps) per environment**
   so staging pushes never reach production devices.

---

## 3. SHA-1 / SHA-256 fingerprints

Required for FCM and (optionally) Android App Links / deep links. Add **all** keys
you sign with: debug, the upload keystore, **and** the Play App Signing key.

```bash
# Debug key (local dev)
keytool -list -v -alias androiddebugkey \
  -keystore ~/.android/debug.keystore -storepass android -keypass android

# Upload / release keystore (from ANDROID_RELEASE.md §3)
keytool -list -v -alias voltreport -keystore voltreport-upload.keystore
```
- Copy both **SHA-1** and **SHA-256** into Firebase → Project Settings → your
  Android app → **Add fingerprint**.
- **Play App Signing:** after the first upload, copy the **App signing key**
  SHA-1/SHA-256 from Play Console → *Setup → App signing* and add those too —
  otherwise push/links break on Play-distributed builds.

---

## 4. `google-services.json`

1. Firebase → Project Settings → your Android app → **Download `google-services.json`**.
2. Place it at **`FE/android/app/google-services.json`** (after `npm run android:add`).
3. It is environment-specific → keep it **out of git** (add to `.gitignore`) and
   inject per build (CI secret / per-env file). Never ship the staging file to prod.

---

## 5. Android configuration

The Capacitor Android plugin and Firebase need the Google Services Gradle plugin.

**`FE/android/build.gradle`** (project-level) — `dependencies`:
```gradle
classpath 'com.google.gms:google-services:4.4.2'
```

**`FE/android/app/build.gradle`** — bottom of file:
```gradle
apply plugin: 'com.google.gms.google-services'

dependencies {
    implementation platform('com.google.firebase:firebase-bom:33.1.0')
    implementation 'com.google.firebase:firebase-messaging'
}
```

**`AndroidManifest.xml`** — notification permission (Android 13+) and default
channel/icon metadata:
```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>

<!-- optional: default channel created by the app at runtime is "voltreport-default" -->
<meta-data
    android:name="com.google.firebase.messaging.default_notification_channel_id"
    android:value="voltreport-default"/>
```
> The app creates the `voltreport-default` channel at runtime via
> `ensureAndroidChannel()`; the manifest meta-data only sets the fallback used by
> data-less notifications.

**Backend** — set the server key from Firebase → Project Settings → **Cloud
Messaging** → *Cloud Messaging API (Legacy) Server key*:
```env
FCM_SERVER_KEY=<server_key>
```
(If the legacy API is disabled in your project, enable it temporarily, or migrate
to HTTP v1 per §1.) Then apply the DB migration on the target host:
```bash
cd BE && npx prisma migrate deploy
```

---

## 6. Testing checklist

| # | Test | How | Expected |
|---|---|---|---|
| 1 | Token registers | Login on a physical device → check `device_tokens` table | new row with the device token |
| 2 | Token refresh | Reinstall / clear app data → login again | row upserted, no duplicates |
| 3 | Foreground notify | App open → validator approves your report | `pushNotificationReceived` logged; UI reflects status |
| 4 | Background notify | App backgrounded → approve | system tray notification appears (heads-up via channel) |
| 5 | Quit-state notify | App killed → approve | notification appears |
| 6 | Tap → deep link | Tap notification | opens `/laporan-awal/:id` (needs `setPushNavigator`) |
| 7 | Channel | Settings → Apps → VoltReport → Notifications | channel "Notifikasi VoltReport" present |
| 8 | Logout unregister | Logout → check `device_tokens` | token removed; no further notifications |
| 9 | Dead-token prune | Send to an uninstalled device's token | row pruned after send |
| 10 | Push disabled | Unset `FCM_SERVER_KEY`, restart BE | app works normally; no push, no errors |

Direct FCM smoke test (bypasses the app workflow):
```bash
curl -X POST https://fcm.googleapis.com/fcm/send \
  -H "Authorization: key=$FCM_SERVER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"to":"<DEVICE_TOKEN>","notification":{"title":"Test","body":"VoltReport"},
       "data":{"type":"laporan-awal","id":"<REPORT_ID>","status":"APPROVED"}}'
```

---

## 7. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| No token registered | `google-services.json` missing/wrong package | Place file in `android/app/`, package = `id.pln.voltreport`; check `registrationError` log |
| Notification never arrives | `FCM_SERVER_KEY` empty or wrong | Set the legacy server key; verify with the curl smoke test |
| Silent on Android 8+ | No notification channel | Confirm `ensureAndroidChannel()` ran; channel importance HIGH |
| No notification on Android 13+ | `POST_NOTIFICATIONS` not granted | Ensure runtime permission prompt accepted |
| Tap does nothing | `setPushNavigator()` not wired | Register the router `navigate` at startup |
| Works debug, fails on Play build | Play App Signing SHA not added | Add Play app-signing SHA-1/256 to Firebase |
| `MismatchSenderId` | token from a different Firebase project | Re-register; ensure one project per environment |
| Tokens pile up | logout not unregistering | Confirm `teardownPush()` runs on logout |
```
