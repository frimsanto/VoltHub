# VoltReport — Android Release Build Guide

> How to produce a **signed Android release** (AAB) of VoltReport for the Google
> Play Console (or internal/MDM distribution). VoltReport is a React/Vite PWA
> wrapped with **Capacitor**; one web codebase, native Android shell.
> Pairs with [`FE/MOBILE.md`](../FE/MOBILE.md) and [`FIREBASE_SETUP.md`](./FIREBASE_SETUP.md).

---

## 0. App identity (source of truth)

| Field | Value | Defined in |
|---|---|---|
| `appId` (applicationId) | `id.pln.voltreport` | [`FE/capacitor.config.ts`](../FE/capacitor.config.ts) |
| `appName` | `VoltReport` | [`FE/capacitor.config.ts`](../FE/capacitor.config.ts) |
| `webDir` | `dist` | served by Capacitor from the Vite build |
| `versionName` | `1.0.0` | must match `APP_VERSION` in [`FE/src/lib/appVersion.ts`](../FE/src/lib/appVersion.ts) and BE `APP_LATEST_VERSION` |
| `androidScheme` | `https` | [`FE/capacitor.config.ts`](../FE/capacitor.config.ts) |

> **Version sync is mandatory.** On every release, the three values
> (`appVersion.ts` → `android/app/build.gradle` `versionName` → backend
> `APP_LATEST_VERSION`/`APP_MIN_VERSION`) must agree, or the force-update gate
> (HTTP 426) will mis-fire.

---

## 1. Audit findings (re-audited 2026-06-18)

### ✅ Present and correct
- `FE/android/` Gradle project **generated and committed**; `AndroidManifest.xml`, `build.gradle`, splash + icon resources all present. minSdk 24, target/compile SDK 36.
- Capacitor 8 configured (`capacitor.config.ts`) with the official PLN app id `id.pln.voltreport`, edge-to-edge StatusBar, `Keyboard.resize:none`, branded SplashScreen (`#0b5cab`).
- All native plugins installed (v8): `@capacitor/app`, `camera`, `geolocation`, `keyboard`, `network`, `preferences`, `push-notifications`, `splash-screen`, `status-bar`.
- Native wrappers with web fallbacks: camera ([`camera.ts`](../FE/src/lib/native/camera.ts)), GPS ([`geolocation.ts`](../FE/src/lib/native/geolocation.ts)), push ([`push.ts`](../FE/src/lib/native/push.ts)), shell bootstrap ([`bootstrap.ts`](../FE/src/lib/native/bootstrap.ts)).
- **Release signing config present** in `app/build.gradle`: env/`gradle.properties`-driven keystore with debug fallback so `assembleRelease`/`bundleRelease` always succeed.
- **Splash screen** configured (`launchAutoHide:false`, hidden after first paint via `hideSplash()`); core-splashscreen androidx lib wired.
- **Back button** handled — `src/lib/native/backButton.ts` (history-back, minimise at root), registered in `initNativeShell`.
- Offline-first queue + IndexedDB photo store run in the WebView (no native dependency).
- App icons present; `npm run icons` / `android:open` / `cap:sync` scripts wired.

### ⚠️ Remaining actions before Play submission
| # | Issue | Action | Severity |
|---|---|---|---|
| 1 | `allowMixedContent: true` + `usesCleartextTraffic="true"` | **Set both to `false`**; point API base at HTTPS | **High (Play policy)** |
| 2 | Push deep-link handling | Add notification channel + `pushNotificationActionPerformed` listener (see [`FIREBASE_SETUP.md`](./FIREBASE_SETUP.md)); requires `google-services.json` (optional, guarded in build.gradle) | Medium |
| 3 | Icon/splash branding | Confirm official PLN logo; regenerate with `npx capacitor-assets generate` if placeholder | Medium |
| 4 | `versionCode 1 / versionName "1.0"` | Bump per release; keep synced with `appVersion.ts` + backend `APP_LATEST_VERSION` (§8) | Medium |

### Verified non-issues
- **Offline mode** runs entirely in the WebView (queue + IndexedDB) — unaffected by the native wrapper.
- **Permissions**: camera (`@capacitor/camera`), location (`@capacitor/geolocation`), and `POST_NOTIFICATIONS` (`@capacitor/push-notifications`) are contributed via manifest merge from the plugins; the app manifest declares `INTERNET`. Confirm the merged set in `app/build/intermediates/merged_manifests/` before release (§5).

---

## 2. One-time project generation

```bash
cd FE
npm ci
npm run android:add          # cap add android → creates FE/android/
npm run cap:sync             # vite build + copy dist/ into the native project
```
After this, **review and commit** `FE/android/` (it is a checked-in native
project, like an Xcode project). Key files you will touch:
- `android/app/build.gradle` — `applicationId`, `versionCode`, `versionName`.
- `android/app/src/main/AndroidManifest.xml` — permissions, app label.
- `android/app/src/main/res/` — icons, splash, `google-services.json` lives in `android/app/`.

---

## 3. Generate the upload keystore (once, keep forever)

The keystore signs every release. **Losing it means you can never update the app
on Play** (unless enrolled in Play App Signing key reset). Back it up securely
(secret manager + offline copy); never commit it.

```bash
keytool -genkeypair -v \
  -keystore voltreport-upload.keystore \
  -alias voltreport \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass <STORE_PASSWORD> -keypass <KEY_PASSWORD> \
  -dname "CN=PT PLN, OU=RTUPP, O=PLN, L=Jakarta, C=ID"
```

Store the four secrets (`storeFile` path, `storePassword`, `keyAlias`,
`keyPassword`) in the org secret manager / CI secrets.

---

## 4. Signing configuration

Create `FE/android/keystore.properties` (gitignored — add to `.gitignore`):
```properties
storeFile=/secure/path/voltreport-upload.keystore
storePassword=<STORE_PASSWORD>
keyAlias=voltreport
keyPassword=<KEY_PASSWORD>
```

Wire it into `FE/android/app/build.gradle`:
```gradle
// top of build.gradle
def keystoreProps = new Properties()
def keystoreFile = rootProject.file("keystore.properties")
if (keystoreFile.exists()) {
    keystoreProps.load(new FileInputStream(keystoreFile))
}

android {
    // ...
    signingConfigs {
        release {
            if (keystoreFile.exists()) {
                storeFile file(keystoreProps['storeFile'])
                storePassword keystoreProps['storePassword']
                keyAlias keystoreProps['keyAlias']
                keyPassword keystoreProps['keyPassword']
            }
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled true
            shrinkResources true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
}
```

> Prefer **Play App Signing**: upload with your upload key; Google manages the
> final app-signing key. This protects against upload-key loss.

---

## 5. Android permissions

Declare only what is used. Add to `android/app/src/main/AndroidManifest.xml`:
```xml
<!-- Network (offline-first sync + API) -->
<uses-permission android:name="android.permission.INTERNET"/>
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE"/>

<!-- GPS — gardu location capture -->
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>

<!-- Camera — field photos -->
<uses-permission android:name="android.permission.CAMERA"/>

<!-- Push notifications (Android 13+) -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>

<!-- Media access for picking existing photos (scoped; SDK-gated) -->
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES"/>
```
- Do **not** add background-location or coarse-only tracking — VoltReport only
  reads location on explicit user tap. Play requires justification for sensitive
  permissions; keep the set minimal.
- Runtime prompts are handled by the plugins (`Camera`, `Geolocation`,
  `PushNotifications.requestPermissions()`).

**Functional verification on a release build:**
- ✅ Offline: enable airplane mode → create Laporan Awal + photo → re-enable network → auto-sync.
- ✅ GPS: tap "Lokasi" on Lokasi Gardu → coordinates appended.
- ✅ Camera: tap "Ambil Foto" → native camera opens → photo attaches.
- ✅ Push: receive an approve/reject notification (requires Firebase — see G3).

---

## 6. Build the AAB (release)

```bash
cd FE
# 1. ensure web build + version sync
#    (bump APP_VERSION in src/lib/appVersion.ts + versionName/versionCode in build.gradle)
npm run cap:sync

# 2. build the signed App Bundle
cd android
./gradlew bundleRelease          # → app/build/outputs/bundle/release/app-release.aab

# (optional) signed APK for sideload / MDM / internal testing
./gradlew assembleRelease        # → app/build/outputs/apk/release/app-release.apk
```
Verify the bundle is signed:
```bash
jarsigner -verify -verbose -certs app/build/outputs/bundle/release/app-release.aab
```

---

## 7. Upload to Play Console

1. Play Console → **Create app** → name `VoltReport`, language, app/game = App, free.
2. Enroll in **Play App Signing** (recommended).
3. **Internal testing** track first → upload `app-release.aab` → add testers (PLN team) → roll out → validate on real devices.
4. Complete required listings: privacy policy URL, data-safety form (declare location, camera, and that data is encrypted in transit / not sold), content rating, target audience.
5. Promote Internal → Closed (UAT with PLN field staff) → Production.
6. For a purely internal app, consider **Internal App Sharing** or an **MDM/EMM** push instead of public Production.

---

## 8. Versioning strategy

| Field | Rule | Example |
|---|---|---|
| `versionName` | Human SemVer; **must equal** `appVersion.ts` `APP_VERSION` and BE `APP_LATEST_VERSION` | `1.0.0`, `1.1.0` |
| `versionCode` | **Monotonic integer**, +1 every uploaded build (Play rejects re-use) | `1`, `2`, `3` … |

Recommended `versionCode` formula (deterministic, collision-free):
```
versionCode = MAJOR*10000 + MINOR*100 + PATCH      # 1.0.0 → 10000, 1.2.3 → 10203
```

**Force-update coupling:** when shipping a breaking API change, bump backend
`APP_MIN_VERSION` to the new `versionName`. Older installs then receive HTTP 426
and the FE renders the blocking "Perbarui Aplikasi" screen
([`FE/src/lib/api/client.ts`](../FE/src/lib/api/client.ts)). Always publish the
new APK/AAB **before** raising `APP_MIN_VERSION`.

---

## 9. Final build checklist

- [ ] `android/` generated, manifest reviewed, committed.
- [ ] `allowMixedContent` → `false`; API base is HTTPS.
- [ ] Official PLN icon + splash generated.
- [ ] `google-services.json` placed in `android/app/` (see [`FIREBASE_SETUP.md`](./FIREBASE_SETUP.md)).
- [ ] Permissions trimmed to: internet, network-state, fine/coarse location, camera, post-notifications, read-media-images.
- [ ] `versionName` synced across `appVersion.ts` + `build.gradle` + backend; `versionCode` incremented.
- [ ] Keystore generated, **backed up off-site**, secrets in secret manager.
- [ ] `keystore.properties` gitignored; signing config wired.
- [ ] `./gradlew bundleRelease` produces a verified-signed AAB.
- [ ] Smoke test on a physical device: login, offline sync, camera, GPS, push.
- [ ] Uploaded to Internal testing and validated before Production rollout.
```
