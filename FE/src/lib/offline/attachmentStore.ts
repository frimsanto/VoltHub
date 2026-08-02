/**
 * IndexedDB store for offline report attachments (photos/videos).
 *
 * localStorage can't hold binary and is ~5 MB; field photos blow that instantly.
 * Files are stored here keyed by the offline-queue item id, then uploaded and
 * cleared once the report syncs. File/Blob survive IndexedDB's structured clone,
 * so no base64 conversion is needed.
 */

const DB_NAME = "voltreport-offline";
const STORE = "attachments";
const DB_VERSION = 1;

/**
 * One inspection finding captured offline, with an optional photo. Findings are
 * created server-side after the parent inspection, and each photo is uploaded
 * per-finding (multipart), so we keep the finding body and its photo together.
 */
export interface QueuedFinding {
  assetId: string;
  status: "NORMAL" | "WARNING" | "CRITICAL";
  finding?: string | null;
  recommendation?: string | null;
  photo?: File;
  caption?: string;
}

/** Attachment bundle for one queued report, grouped by upload category. */
export interface QueuedAttachments {
  // Laporan Awal: single "all-in-one" bucket.
  dokumentasi?: File[];
  // Laporan Akhir: categorized buckets.
  logger?: File[];
  sld?: File[];
  dokumentasiHasil?: File[];
  // Inspection: findings (each with its own optional photo) replayed after the
  // inspection is created.
  findings?: QueuedFinding[];
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

function hasFiles(att: QueuedAttachments): boolean {
  // `findings` is an array of objects (not Files), but its presence is still
  // meaningful payload to persist — replay needs it even without photos.
  return Object.values(att).some((arr) => Array.isArray(arr) && arr.length > 0);
}

export async function saveAttachments(
  queueId: string,
  attachments: QueuedAttachments,
): Promise<void> {
  if (!hasFiles(attachments)) return;
  try {
    await withStore("readwrite", (s) => s.put(attachments, queueId));
  } catch {
    // IndexedDB unavailable (private mode / quota) — report still syncs, photos
    // simply won't replay. The user is told to re-attach from Riwayat.
  }
}

export async function getAttachments(queueId: string): Promise<QueuedAttachments | null> {
  try {
    const result = await withStore<QueuedAttachments | undefined>("readonly", (s) =>
      s.get(queueId),
    );
    return result ?? null;
  } catch {
    return null;
  }
}

export async function deleteAttachments(queueId: string): Promise<void> {
  try {
    await withStore("readwrite", (s) => s.delete(queueId));
  } catch {
    // ignore
  }
}
