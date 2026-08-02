# VoltReport V2 — Design System

Version: 1.0
Date: 2026-06-03
Stack: **TailwindCSS v4** + **Shadcn UI** (Radix primitives) — sesuai `TDD_FRONTEND.md §1`.
Source of Truth: `TDD_FRONTEND.md`, `docs/WEB_ADMIN_WIREFRAMES.md`.

> Standar UI ini mengonsolidasikan komponen shadcn yang **sudah tersedia** di `FE/src/components/ui/` (reusable, lihat Gap Analysis §3.1) dan menetapkan pola pakai yang konsisten untuk seluruh modul V2. Tidak mengubah backend/API/RBAC.

---

## 1. Layout Structure

Pola dasar: **Sidebar (fixed) + Topbar (sticky) + Content (scrollable)**.

```
+----------------------------------------------------------------------+
| Topbar (sticky, h-16)                                                 |
+----------+-----------------------------------------------------------+
| Sidebar  | Content area                                              |
| (fixed,  |  max-w container, padding, PageHeader + body              |
|  w-260 / |                                                           |
|  w-72    |                                                           |
| collapsed|                                                           |
+----------+-----------------------------------------------------------+
```

- **Breakpoints:** Desktop (≥`lg`) sidebar permanen; `<lg` sidebar jadi off-canvas `Sheet`.
- **Container konten:** `mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6`.
- **Spacing scale:** kelipatan 4 (`gap-2/4/6`, `space-y-4/6`).
- **Radius:** `rounded-lg` (kartu/tabel), `rounded-md` (tombol/input), `rounded-xl` (item nav).
- **Token warna** (CSS variables shadcn): `background`, `foreground`, `card`, `muted`, `border`, `primary`, `accent`, `destructive`, `success`. Dark mode via class `dark` di `<html>` (pola existing `vr-theme` localStorage). Aksen brand PLN: `pln-yellow`, `pln-blue-dark` (existing).

```tsx
// AppLayout (port dari FE _app.tsx)
<div className="min-h-screen flex bg-background text-foreground">
  <Sidebar />
  <div className="flex-1 flex flex-col min-w-0">
    <Topbar />
    <main className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        <Outlet />
      </div>
    </main>
  </div>
</div>
```

---

## 2. Sidebar Structure

Mengikuti komponen existing `FE/src/components/Sidebar.tsx` (RBAC, collapsible group, mobile Sheet, icon rail saat collapsed).

- **Struktur menu (grup):** `Dashboard` · `Master Data` (Locations, Feeders, Assets, Communication Media) · `Operations` (Inspection, HAR, Documents) · `Reports` · `Import` · `AI Search` · `Administration` (Users, Teams, RTUPP) · `Profile`.
- **RBAC:** menu di-filter per role (`SUPERADMIN`/`ADMIN`/`ADMIN_RTUPP`/`USER`) — item yang route-nya tak diizinkan **tidak dirender** (tanpa orphan/redirect).
- **State:** `collapsed` (icon rail `w-72`/full `w-260`), tersimpan di `stores/auth.ts`. Active state: `bg-sidebar-primary text-sidebar-primary-foreground`.
- **Pola item:**

```tsx
type MenuLeaf  = { label: string; to: string; icon: IconType };
type MenuGroup = { label: string; icon: IconType; children: MenuLeaf[] };
const MENUS: Record<Role, (MenuLeaf | MenuGroup)[]> = { /* per role */ };
```

- Komponen: `Collapsible` (grup), `Sheet` (mobile), `Button`, `lucide-react` icons.

---

## 3. Table Standard

**Komponen:** `DataTable` generik berbasis **TanStack Table** (perlu ditambah `@tanstack/react-table`) + primitive shadcn `ui/table.tsx`.

**Wajib:**
- Server-side pagination (bind ke `ApiResponse.meta`: `page/limit/total/totalPages`).
- Toolbar: search (debounce), filter (Select), column visibility (`Columns ▾`).
- Sort per kolom, row actions (`👁 View / ✎ Edit / 🗑 Delete`).
- States: loading → skeleton rows; empty → `EmptyState`; error → `ErrorState`.

```tsx
<DataTable
  columns={columns}
  data={query.data?.items ?? []}
  pageCount={query.data?.meta.totalPages ?? 0}
  state={{ pagination, sorting, columnFilters }}
  onPaginationChange={setPagination}
  isLoading={query.isLoading}
  isError={query.isError}
  toolbar={<DataTableToolbar table={table} filters={[...]} />}
/>
```

Layout standar list page:

```
PageHeader (title + [+ Create])
└─ Card
   ├─ Toolbar: [🔍 Search] [Filter ▾] [Columns ▾]
   ├─ Table (sortable headers, row actions)
   └─ Footer: "Showing X-Y of N"  [< Prev] Page p/T [Next >]
```

---

## 4. Form Standard

**Komponen:** `react-hook-form` + `zod` (`@hookform/resolvers`) + shadcn `ui/form.tsx` (`Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage`) + `Input`/`Select`/`Textarea`/`Checkbox`/`Calendar`.

**Aturan:**
- Skema Zod sebagai single source validasi; tipe diturunkan via `z.infer`.
- Wajib tandai `*`; error inline di bawah field (`FormMessage`).
- Submit: tombol disabled + spinner saat `isSubmitting`; sukses → `toast` + invalidate query; error API → `toast` (pakai `handleError`).
- Layout: 1 kolom (modal), 2 kolom (`grid grid-cols-1 md:grid-cols-2 gap-4`) untuk form panjang.

```tsx
const schema = z.object({ code: z.string().min(1), name: z.string().min(1), type: z.enum([...]) });
const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

<Form {...form}>
  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
    <FormField name="code" control={form.control} render={({ field }) => (
      <FormItem>
        <FormLabel>Code *</FormLabel>
        <FormControl><Input {...field} /></FormControl>
        <FormMessage />
      </FormItem>
    )} />
    <div className="flex justify-end gap-2">
      <Button variant="outline" type="button" onClick={onCancel}>Cancel</Button>
      <Button type="submit" disabled={form.formState.isSubmitting}>Save</Button>
    </div>
  </form>
</Form>
```

---

## 5. Modal Standard

**Komponen:** shadcn `Dialog` (form/detail), `AlertDialog` (konfirmasi destruktif), `Sheet` (panel samping/filter mobile), `Drawer` (mobile bottom).

**Aturan:**
- Create/Edit entity → `Dialog` (`EntityFormModal` wrapper standar).
- Konfirmasi delete → `AlertDialog` (`ConfirmDeleteDialog`).
- Header: judul jelas (`Create X` / `Edit X`) + tombol close `[X]`.
- Footer kanan: `[Cancel] [Save/Confirm]`; tombol destruktif `variant="destructive"`.
- Lebar: `sm:max-w-md` (form pendek), `sm:max-w-lg/2xl` (form panjang/preview).
- Fokus trap & ESC bawaan Radix; jangan tutup paksa saat submitting.

```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent className="sm:max-w-lg">
    <DialogHeader><DialogTitle>Create Location</DialogTitle></DialogHeader>
    {/* form */}
  </DialogContent>
</Dialog>
```

---

## 6. Toast Standard

**Komponen:** `sonner` (`ui/sonner.tsx`) — satu `<Toaster />` di root.

**Aturan (TDD §23):**
- Sukses: `toast.success("...")` (mis. "Location berhasil dibuat").
- Error: `toast.error(handleError(err))` — gunakan helper `handleError` (`lib/api/client.ts`) untuk pesan ber-bahasa Indonesia konsisten.
- Kategori error: Validation, Business Rule, Unauthorized (401→auto refresh/logout), Forbidden (403), Server (5xx).
- Posisi `top-right`; durasi default; jangan spam (de-dupe untuk aksi batch).
- Untuk konfirmasi berisiko gunakan `AlertDialog`/`swal` (existing `lib/swal.ts`), bukan toast.

```tsx
try { await mutate(payload); toast.success("Tersimpan"); qc.invalidateQueries(...); }
catch (e) { toast.error(handleError(e as AxiosError)); }
```

---

## 7. Loading Standard

**Komponen:** `Skeleton` (`ui/skeleton.tsx` + `components/Skeleton.tsx`), spinner inline, `Progress` (upload/import).

**Aturan (TDD §24):**
- **List/Table:** skeleton rows (jangan spinner penuh halaman).
- **Detail page:** skeleton blok sesuai layout.
- **Button action:** spinner + disabled, label tetap.
- **Upload/Import:** `Progress` bar dengan persentase.
- **Route transition:** TanStack Router pending → skeleton/`Suspense` fallback.

```tsx
{isLoading
  ? <TableSkeleton rows={8} cols={5} />
  : <DataTable ... />}
```

---

## 8. Empty State Standard

**Komponen:** `components/EmptyState.tsx` (existing, reusable).

**Aturan:**
- Ikon + judul singkat + deskripsi + CTA utama (mis. `[+ Create Location]`).
- Bedakan "belum ada data" vs "tidak ada hasil filter/search" (yang kedua: tawarkan reset filter).

```tsx
<EmptyState
  icon={MapPin}
  title="Belum ada Location"
  description="Tambahkan location pertama untuk mulai."
  action={<Button onClick={openCreate}>+ Create Location</Button>}
/>
```

---

## 9. Error State Standard

**Komponen:** `ErrorBoundary.tsx` (existing), inline error block, halaman `/unauthorized` (403) & `/404`.

**Aturan (TDD §23):**
- **Render crash:** `ErrorBoundary` membungkus route → fallback + tombol "Coba lagi".
- **Query error:** inline error block dengan pesan `handleError` + tombol `Retry` (`query.refetch`).
- **401:** ditangani interceptor (refresh → logout otomatis ke `/login`).
- **403:** arahkan ke `/unauthorized` (page existing).
- **404:** route `/404` existing.
- **5xx / network:** toast + Sentry capture (sudah ada di `client.ts`).

```tsx
{isError && (
  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
    <p className="text-sm text-destructive">{handleError(error)}</p>
    <Button variant="outline" className="mt-3" onClick={() => refetch()}>Coba lagi</Button>
  </div>
)}
```

---

## 10. Komponen Lintas-Modul (Standar Turunan)

| Komponen | Basis | Fungsi |
|----------|-------|--------|
| `PageHeader` | div + `Breadcrumb` | Judul + breadcrumb + actions |
| `DataTable` / `DataTableToolbar` | TanStack Table + `ui/table` | Tabel standar (§3) |
| `EntityFormModal` | `Dialog` + `Form` | Create/Edit standar (§4,§5) |
| `ConfirmDeleteDialog` | `AlertDialog` | Soft-delete (§5) |
| `StatusBadge` | `Badge` | Status Inspection/HAR/Asset |
| `RoleGate` | `stores/auth` | Show/hide by role (RBAC) |
| `PhotoUploader`/`DocumentUploader` | `Progress`+input file | Upload + preview (§7) |
| `StatCard` | `Card` | Widget dashboard |

---

## 11. Aksesibilitas & Konsistensi

- Semua interaktif keyboard-accessible (Radix bawaan); `aria-label` pada icon-only button.
- Kontras warna mengikuti token; uji light & dark.
- Bahasa UI: **Indonesia** untuk label/pesan pengguna (konsisten dgn existing).
- Ikon: `lucide-react` (sudah terinstal), ukuran `size-[18px]` nav / `h-4 w-4` inline.
- Tanggal: `date-fns` (existing) format `dd MMM yyyy`.
