# VoltReport — Desktop / Android / iOS

Aplikasi ini adalah **web app React (Vite)** yang dijadikan **PWA** dan dibungkus
**Capacitor** untuk menjadi aplikasi native Android, iOS, dan desktop. Satu
codebase, tiga platform.

## Status saat ini (Fase 1 & 2 — selesai)

**Fase 1:**
- ✅ **PWA installable** — `vite-plugin-pwa` + manifest + ikon. Bisa di-"Install"
  dari Chrome (Android/desktop) dan "Add to Home Screen" (iOS Safari).
- ✅ **Offline-first** — laporan yang dibuat tanpa sinyal disimpan di antrian
  (`src/lib/offline/`) dan dikirim otomatis saat online. Indikator offline +
  badge sinkronisasi aktif.
- ✅ **Capacitor dikonfigurasi** — `capacitor.config.ts` siap; tinggal `cap add`.

**Fase 2:**
- ✅ **Lampiran foto offline** — foto/video disimpan di IndexedDB
  (`src/lib/offline/attachmentStore.ts`) dan ikut terkirim otomatis saat laporan
  tersinkron. Tidak ada lagi laporan offline tanpa foto.
- ✅ **Secure token storage** — token disimpan di Capacitor Preferences (storage
  aman OS) di native, localStorage di web (`src/lib/secureStorage.ts`).
- ✅ **Kamera native** — tombol "Ambil Foto" di UploadZone (Capacitor app);
  `src/lib/native/camera.ts`. Di web, file input sudah membuka kamera di HP.
- ✅ **GPS lokasi gardu** — tombol "Lokasi" di field Lokasi Gardu menambahkan
  koordinat; `src/lib/native/geolocation.ts` (plugin native / browser fallback).

## Build aplikasi native

Prasyarat: **Android Studio** (Android) / **Xcode + macOS** (iOS).

```bash
# 1. (sekali) tambahkan platform — otomatis meng-install @capacitor/android|ios
npm run android:add        # → membuat folder android/
npm run ios:add            # → membuat folder ios/ (hanya di macOS)

# 2. build web + sync + buka di IDE native
npm run android:open       # buka Android Studio → Run/Build APK/AAB
npm run ios:open           # buka Xcode → Run/Archive

# build web + sync saja (tanpa buka IDE)
npm run cap:sync
```

Setiap kali kode web berubah: `npm run cap:sync` (atau `*:open`) untuk
menyalin `dist/` ke proyek native.

### Signed release APK / AAB (Android)

`android/app/build.gradle` membaca kredensial signing dari **environment
variable** (CI secrets) atau `~/.gradle/gradle.properties` — tidak pernah
di-commit. Jika tidak diset, build release jatuh ke debug-signing agar
`assembleRelease` tetap berhasil (cocok untuk smoke build).

```bash
# Sekali: buat keystore rilis (simpan aman, JANGAN commit)
keytool -genkey -v -keystore volthub-release.jks -alias volthub \
  -keyalg RSA -keysize 2048 -validity 10000

# Build signed (isi 4 variabel ini dari secret store):
export RELEASE_STORE_FILE=/path/volthub-release.jks
export RELEASE_STORE_PASSWORD=********
export RELEASE_KEY_ALIAS=volthub
export RELEASE_KEY_PASSWORD=********
cd android && ./gradlew assembleRelease   # APK → app/build/outputs/apk/release
./gradlew bundleRelease                    # AAB (Play Store) → bundle/release
```

Sebelum publish ke Play Store: matikan cleartext/mixed-content (set
`allowMixedContent:false` di `capacitor.config.ts`, hapus `usesCleartextTraffic`
dari manifest) bila API sudah https-only.

## Desktop

- **Cara cepat:** install sebagai PWA dari Chrome/Edge (menu → Install VoltReport).
- **Aplikasi desktop terbungkus:** tambahkan Electron atau Tauri (Fase 3).

## Ikon

`public/icon.svg` + `icon-192/512.png` adalah placeholder (petir kuning di latar
biru PLN). Ganti dengan logo resmi lalu jalankan `npm run icons` untuk regenerasi
PNG, atau timpa file PNG langsung.

**Fase 3:**
- ✅ **Force-update + API versioning** — BE menolak klien lawas (HTTP 426 lewat
  `X-App-Version`); FE menampilkan layar "Perbarui Aplikasi". Atur via env
  `APP_MIN_VERSION` / `APP_LATEST_VERSION` di backend, bump `APP_VERSION` di
  `src/lib/appVersion.ts` tiap rilis.
- ✅ **Push notification (FCM)** — token device diregistrasi saat login
  (`src/lib/native/push.ts`); pemilik laporan dapat notifikasi saat
  approve/reject. Lihat **Setup push** di bawah.
- ✅ **Desktop** — lihat `DESKTOP.md` (PWA install + opsi Electron/Tauri).

## Setup push (Firebase)

> ⚠️ **Push dimatikan secara default** (`VITE_PUSH_ENABLED=false`). Memanggil
> `PushNotifications.register()` tanpa project Firebase membuat plugin native
> memanggil `FirebaseMessaging.getToken()` → `IllegalStateException: Default
> FirebaseApp is not initialized` di thread native → **app crash saat izin
> notifikasi diberikan** (exception native ini tidak bisa ditangkap try/catch JS).
> Aktifkan `VITE_PUSH_ENABLED=true` HANYA setelah `google-services.json` (Android)
> & APNs (iOS) terpasang.

1. Buat project Firebase, tambahkan app Android/iOS, unduh `google-services.json`
   / `GoogleService-Info.plist` ke proyek native (`android/app/` / `ios/`).
2. Backend: set `FCM_SERVER_KEY` (Firebase → Project Settings → Cloud Messaging).
   Tanpa key ini, push otomatis non-aktif (app tetap berjalan normal).
   Lalu set `VITE_PUSH_ENABLED=true` di `.env` FE dan rebuild.
3. Terapkan migrasi DB tabel `device_tokens`:
   `cd ../BE && npx prisma migrate deploy`.
