/**
 * Local-first durable store (Messenger-style phone mirror).
 *
 * IndexedDB in the Capacitor WebView — no extra native plugin.
 * Server (Supabase/VPS) remains source of truth; this is the fast local mirror.
 *
 * Message/inbox payloads are AES-GCM encrypted at rest when Web Crypto is available.
 */

const DB_NAME = "jackpot_jungle_local_db";
const DB_VERSION = 3;
const STORE_KV = "kv";
const STORE_MSGS = "messages";
const STORE_INBOX = "inbox";
const STORE_PROFILES = "profiles";
const STORE_PRESENCE = "presence";
const STORE_TYPING = "typing";
const STORE_REACTIONS = "reactions";

const ENC_PREFIX = "jjenc1:";
const DEVICE_KEY_ID = "__jj_device_aes_key";

type KvValue = string | number | boolean | object | null;

let dbPromise: Promise<IDBDatabase | null> | null = null;
let cryptoKeyPromise: Promise<CryptoKey | null> | null = null;

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
        if (!db.objectStoreNames.contains(STORE_PROFILES)) db.createObjectStore(STORE_PROFILES);
        if (!db.objectStoreNames.contains(STORE_PRESENCE)) db.createObjectStore(STORE_PRESENCE);
        if (!db.objectStoreNames.contains(STORE_TYPING)) db.createObjectStore(STORE_TYPING);
        if (!db.objectStoreNames.contains(STORE_REACTIONS)) db.createObjectStore(STORE_REACTIONS);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch((err) => {
      console.warn("[local-db] IndexedDB open failed, using localStorage fallback:", err);
      dbPromise = null;
      return null;
    });
  }
  return dbPromise;
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
    /* quota */
  }
}

function lsRemove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function b64ToBuf(b64: string): ArrayBuffer {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes.buffer;
}

async function getDeviceKey(): Promise<CryptoKey | null> {
  if (typeof crypto === "undefined" || !crypto.subtle) return null;
  if (!cryptoKeyPromise) {
    cryptoKeyPromise = (async () => {
      try {
        let rawB64 = await idbGet<string>(STORE_KV, DEVICE_KEY_ID);
        let raw: Uint8Array;
        if (typeof rawB64 === "string" && rawB64.length > 0) {
          raw = new Uint8Array(b64ToBuf(rawB64));
        } else {
          raw = crypto.getRandomValues(new Uint8Array(32));
          await idbSet(STORE_KV, DEVICE_KEY_ID, bufToB64(raw.buffer));
        }
        return await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
          "encrypt",
          "decrypt",
        ]);
      } catch (e) {
        console.warn("[local-db] crypto key unavailable:", e);
        return null;
      }
    })();
  }
  return cryptoKeyPromise;
}

async function seal(value: unknown): Promise<unknown> {
  try {
    const key = await getDeviceKey();
    if (!key) return value;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plain = new TextEncoder().encode(JSON.stringify(value));
    const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
    return ENC_PREFIX + bufToB64(iv.buffer) + "." + bufToB64(cipher);
  } catch {
    return value;
  }
}

async function unseal<T>(stored: unknown): Promise<T | undefined> {
  if (stored == null) return undefined;
  if (typeof stored !== "string" || !stored.startsWith(ENC_PREFIX)) {
    return stored as T;
  }
  try {
    const key = await getDeviceKey();
    if (!key) return undefined;
    const body = stored.slice(ENC_PREFIX.length);
    const [ivB64, cipherB64] = body.split(".");
    if (!ivB64 || !cipherB64) return undefined;
    const iv = new Uint8Array(b64ToBuf(ivB64));
    const cipher = b64ToBuf(cipherB64);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
    return JSON.parse(new TextDecoder().decode(plain)) as T;
  } catch {
    return undefined;
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

/** Per-conversation sync cursor (ISO timestamp of last synced message). */
export async function localDbGetSyncCursor(convKey: string): Promise<string | null> {
  const v = await localDbGetKv(`sync_cursor_${convKey}`);
  return typeof v === "string" && v ? v : null;
}

export async function localDbSetSyncCursor(convKey: string, iso: string): Promise<void> {
  await localDbSetKv(`sync_cursor_${convKey}`, iso);
}

/** Thread messages by conversation key (sorted peer ids, group-*, page-*). */
export async function localDbGetMessages<T>(convKey: string): Promise<T[] | null> {
  const fromIdb = await idbGet<unknown>(STORE_MSGS, convKey);
  if (fromIdb !== undefined) {
    const decoded = await unseal<T[]>(fromIdb);
    if (Array.isArray(decoded)) return decoded;
  }
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
  const sealed = await seal(messages);
  await idbSet(STORE_MSGS, convKey, sealed);
  // Slim plaintext LS mirror for cold-start sync paint only (last 40).
  try {
    const slim = messages.length > 40 ? messages.slice(-40) : messages;
    lsSet(`jj_msgs_${convKey}`, JSON.stringify(slim));
  } catch {
    lsRemove(`jj_msgs_${convKey}`);
  }
  // Advance cursor from newest message.
  const last = messages[messages.length - 1] as { created_at?: string } | undefined;
  if (last?.created_at) {
    await localDbSetSyncCursor(convKey, last.created_at);
  }
}

/** Merge by id (edits/seen) and persist — used by realtime + delta sync. */
export async function localDbUpsertMessages<T extends { id: string; created_at?: string }>(
  convKey: string,
  rows: T[],
  opts?: { deleteIds?: string[] },
): Promise<T[]> {
  const existing = (await localDbGetMessages<T>(convKey)) || [];
  const byId = new Map(existing.map((m) => [m.id, m]));
  for (const row of rows) {
    byId.set(row.id, { ...(byId.get(row.id) as T | undefined), ...row });
  }
  if (opts?.deleteIds?.length) {
    for (const id of opts.deleteIds) byId.delete(id);
  }
  const next = Array.from(byId.values()).sort((a, b) =>
    String(a.created_at || "").localeCompare(String(b.created_at || "")),
  );
  // Cap local history to keep IDB healthy (older pages stay on server).
  const capped = next.length > 500 ? next.slice(-500) : next;
  await localDbSetMessages(convKey, capped);
  return capped;
}

export async function localDbDeleteMessages(convKey: string): Promise<void> {
  await idbDelete(STORE_MSGS, convKey);
  lsRemove(`jj_msgs_${convKey}`);
}

export async function localDbGetInbox<T>(): Promise<T[] | null> {
  const fromIdb = await idbGet<unknown>(STORE_INBOX, "conversations");
  if (fromIdb !== undefined) {
    const decoded = await unseal<T[]>(fromIdb);
    if (Array.isArray(decoded)) return decoded;
  }
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
  const sealed = await seal(conversations);
  await idbSet(STORE_INBOX, "conversations", sealed);
  try {
    lsSet("jj_cached_conversations", JSON.stringify(conversations));
  } catch {
    /* ignore */
  }
}

export async function localDbGetProfile<T>(userId: string): Promise<T | null> {
  const fromIdb = await idbGet<unknown>(STORE_PROFILES, userId);
  if (fromIdb !== undefined) {
    const decoded = await unseal<T>(fromIdb);
    if (decoded && typeof decoded === "object") return decoded;
  }
  const raw = lsGet(`jj_profile_${userId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function localDbSetProfile(userId: string, profile: unknown): Promise<void> {
  const sealed = await seal(profile);
  await idbSet(STORE_PROFILES, userId, sealed);
  try {
    lsSet(`jj_profile_${userId}`, JSON.stringify(profile));
  } catch {
    /* ignore */
  }
}

/** Admin page-inbox mirror (separate from user conversations). */
export async function localDbGetAdminInbox<T>(): Promise<T[] | null> {
  const fromIdb = await idbGet<unknown>(STORE_INBOX, "admin-conversations");
  if (fromIdb !== undefined) {
    const decoded = await unseal<T[]>(fromIdb);
    if (Array.isArray(decoded)) return decoded;
  }
  const raw = lsGet("jj_cached_admin_conversations");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function localDbSetAdminInbox(conversations: unknown[]): Promise<void> {
  const sealed = await seal(conversations);
  await idbSet(STORE_INBOX, "admin-conversations", sealed);
  try {
    lsSet("jj_cached_admin_conversations", JSON.stringify(conversations));
  } catch {
    /* ignore */
  }
}

export type LocalPresence = {
  userId: string;
  online: boolean;
  last_seen: string;
  cachedAt: string;
};

export async function localDbGetPresence(userId: string): Promise<LocalPresence | null> {
  const v = await idbGet<LocalPresence>(STORE_PRESENCE, userId);
  return v ?? null;
}

export async function localDbSetPresence(presence: LocalPresence): Promise<void> {
  await idbSet(STORE_PRESENCE, presence.userId, presence);
}

export async function localDbSetTyping(
  convKey: string,
  payload: { userId: string; at: string },
): Promise<void> {
  await idbSet(STORE_TYPING, convKey, payload);
}

export async function localDbGetTyping(
  convKey: string,
): Promise<{ userId: string; at: string } | null> {
  return (await idbGet<{ userId: string; at: string }>(STORE_TYPING, convKey)) ?? null;
}

export async function localDbSetReactions(
  messageId: string,
  reactions: unknown,
): Promise<void> {
  const sealed = await seal(reactions);
  await idbSet(STORE_REACTIONS, messageId, sealed);
}

export async function localDbGetReactions<T>(messageId: string): Promise<T | null> {
  const fromIdb = await idbGet<unknown>(STORE_REACTIONS, messageId);
  if (fromIdb === undefined) return null;
  const decoded = await unseal<T>(fromIdb);
  return decoded ?? null;
}

/** Warm the IDB connection + crypto key early on native boot. */
export function localDbWarm(): void {
  void openDb().then(() => getDeviceKey());
}
