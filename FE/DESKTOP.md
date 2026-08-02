# VoltReport — Desktop

Dua jalur, dari yang paling ringan:

## 1. PWA (sudah aktif — tanpa build)

Aplikasi sudah PWA. Di Chrome/Edge: menu → **Install VoltReport**. Terpasang
sebagai jendela aplikasi sendiri (tanpa address bar), punya ikon, dan bekerja
offline. Untuk mayoritas kebutuhan operator desktop, ini sudah cukup dan tidak
perlu build apa pun.

## 2. Aplikasi desktop terbungkus (Electron via Capacitor)

Memakai build web yang sama (`dist/`) seperti Android/iOS — satu codebase.

Prasyarat: Node + (Windows) build tools standar.

```bash
cd FE
npm install @capacitor-community/electron
npx cap add @capacitor-community/electron   # membuat folder electron/
npm run build && npx cap sync @capacitor-community/electron
cd electron && npm start                    # jalankan desktop app (dev)
npm run electron:make                        # build installer (.exe/.dmg/.AppImage)
```

Setiap kode web berubah: `npm run build && npx cap sync @capacitor-community/electron`.

### Alternatif: Tauri (binari lebih kecil, butuh Rust)

```bash
npm install -D @tauri-apps/cli
npx tauri init      # webDir = ../dist, devUrl = http://localhost:5173
npm run build && npx tauri build
```

Tauri menghasilkan installer jauh lebih kecil (~3–10 MB vs ~80 MB Electron) tapi
memerlukan toolchain Rust terpasang.

## Rekomendasi

Mulai dari **PWA** (sudah jalan). Pilih **Electron** hanya jika butuh installer
resmi / integrasi OS lebih dalam, atau **Tauri** bila ukuran installer kritis.
