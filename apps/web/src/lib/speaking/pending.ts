// A recording not yet scored, kept on this device (IndexedDB) so a failed upload, a lost connection
// or a closed tab doesn't mean recording again (M7-F3). One per cue card; cleared once scored.
// Best effort: private browsing may refuse IndexedDB, and then nothing is kept.

export type PendingRecording = {
  topicId: string;
  blob: Blob;
  recorderType: string | null;
  durationSec: number;
  /** Set once the session exists / the upload finished, so a retry reuses them. */
  sessionId?: string;
  audioPath?: string;
  savedAt: number;
};

const DB = "prepora";
const STORE = "speaking-pending";

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "topicId" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await open();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  }).finally(() => db.close()) as Promise<T | null>;
}

export const savePending = (p: PendingRecording) => run("readwrite", (s) => s.put(p)).then(() => undefined);
export const loadPending = (topicId: string) => run<PendingRecording | undefined>("readonly", (s) => s.get(topicId)).then((r) => r ?? null);
export const clearPending = (topicId: string) => run("readwrite", (s) => s.delete(topicId)).then(() => undefined);
