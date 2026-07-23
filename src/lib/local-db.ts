/**
 * Durable local store for native-first messaging.
 *
 * Uses IndexedDB in the Capacitor WebView (no extra native plugin) so message
 * JSON is not unbounded in localStorage. Falls back to localStorage when IDB
 * is unavailable. Sync cursors live here too.
 */

const DB_NAME = "jackpot_jungle_local_db";
const DB_VERSION = 1;
const STORE_KV = "kv";
const STORE_MSGS = "messages";
const STORE_INBOX = "inbox";

type KvValue = string | object | null;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_KV)) db.createObjectStore(STORE_KV);
        if (!db.objectStoreNames.contains(STORE_MSGS)) db.createObjectStore(STORE_MSGS);
        if (!db.objectStoreNames.contains(STORE_INBOX)) db.createObjectStore(STORE_INBOX);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch((err) => {
      console.warn("[local-db] IndexedDB open failed, using localStorage fallback:", err);
      dbPromise = null;
      return null as unknown as IDBDatabase;
    });
  }
  return dbPromise.then((db) => db ?? null);
}

function idbGet<T>(store: string, key: string): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise((resolve) => {
        if (!db) {
          resolve(undefined);
          return;
        }
        try {
          const tx = db.transaction(store, "readonly");
          const req = tx.objectStore(store).get(key);
          req.onsuccess = () => resolve(req.result as T | undefined);
          req.onerror = () => resolve(undefined);
        } catch {
          resolve(undefined);
        }
      }),
  );
}

function idbSet(store: string, key: string, value: unknown): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve) => {
        if (!db) {
          resolve();
          return;
        }
        try {
          const tx = db.transaction(store, "readwrite");
          tx.objectStore(store).put(value, key);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch {
          resolve();
        }
      }),
  );
}

function idbDelete(store: string, key: string): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve) => {
        if (!db) {
          resolve();
          return;
        }
        try {
          const tx = db.transaction(store, "readwrite");
          tx.objectStore(store).delete(key);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch {
          resolve();
        }
      }),
  );
}

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function lsSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* quota — ignore */
  }
}

function lsRemove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Sync cursor / small KV */
export async function localDbGetKv(key: string): Promise<KvValue> {
  const fromIdb = await idbGet<KvValue>(STORE_KV, key);
  if (fromIdb !== undefined) return fromIdb;
  const raw = lsGet(`jj_ldb_${key}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export async function localDbSetKv(key: string, value: KvValue): Promise<void> {
  await idbSet(STORE_KV, key, value);
  try {
    lsSet(`jj_ldb_${key}`, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

/** Thread messages by conversation key (sorted peer ids or group-*). */
export async function localDbGetMessages<T>(convKey: string): Promise<T[] | null> {
  const fromIdb = await idbGet<T[]>(STORE_MSGS, convKey);
  if (fromIdb) return fromIdb;
  const raw = lsGet(`jj_msgs_${convKey}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function localDbSetMessages(convKey: string, messages: unknown[]): Promise<void> {
  await idbSet(STORE_MSGS, convKey, messages);
  // Keep a small localStorage mirror for cold-start sync read of last few threads only
  // is handled by chat-cache; prefer IDB as source of truth going forward.
  try {
    const slim = messages.length > 80 ? messages.slice(-80) : messages;
    lsSet(`jj_msgs_${convKey}`, JSON.stringify(slim));
  } catch {
    lsRemove(`jj_msgs_${convKey}`);
  }
}

export async function localDbDeleteMessages(convKey: string): Promise<void> {
  await idbDelete(STORE_MSGS, convKey);
  lsRemove(`jj_msgs_${convKey}`);
}

export async function localDbGetInbox<T>(): Promise<T[] | null> {
  const fromIdb = await idbGet<T[]>(STORE_INBOX, "conversations");
  if (fromIdb) return fromIdb;
  const raw = lsGet("jj_cached_conversations");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function localDbSetInbox(conversations: unknown[]): Promise<void> {
  await idbSet(STORE_INBOX, "conversations", conversations);
  try {
    lsSet("jj_cached_conversations", JSON.stringify(conversations));
  } catch {
    /* ignore */
  }
}

/** Warm the IDB connection early on native boot (fire-and-forget). */
export function localDbWarm(): void {
  void openDb();
}
