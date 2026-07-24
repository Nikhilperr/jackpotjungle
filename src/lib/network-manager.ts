import { supabase } from "@/integrations/supabase/client";

/** online = normal, vpn = online via VPN (info only), offline = no reachability, reconnecting = verifying after link restored */
export type NetworkStatus = "online" | "offline" | "vpn" | "reconnecting";

// Client-side RFC4122 v4 UUID generator
export function generateUUID(): string {
  let d = new Date().getTime();
  let d2 = (typeof performance !== 'undefined' && performance.now && (performance.now() * 1000)) || 0;
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    let r = Math.random() * 16;
    if (d > 0) {
      r = (d + r) % 16 | 0;
      d = Math.floor(d / 16);
    } else {
      r = (d2 + r) % 16 | 0;
      d2 = Math.floor(d2 / 16);
    }
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// Simple IndexedDB Wrapper for persistent offline media blobs
class IndexedDBStore {
  private dbName = "jackpot_jungle_offline_db";
  private storeName = "media_blobs";

  private getDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof window === "undefined" || !window.indexedDB) {
        reject(new Error("IndexedDB is not supported on this platform"));
        return;
      }
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async get(key: string): Promise<Blob | null> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(this.storeName, "readonly");
        const store = transaction.objectStore(this.storeName);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.warn("IndexedDB get error:", e);
      return null;
    }
  }

  async set(key: string, blob: Blob): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(this.storeName, "readwrite");
        const store = transaction.objectStore(this.storeName);
        const request = store.put(blob, key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.warn("IndexedDB set error:", e);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(this.storeName, "readwrite");
        const store = transaction.objectStore(this.storeName);
        const request = store.delete(key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.warn("IndexedDB delete error:", e);
    }
  }
}

export interface QueuedMessage {
  id: string; // client-generated UUID
  sender_id: string;
  receiver_id: string | null;
  group_id: string | null;
  content: string | null;
  image_url: string | null; // local preview Blob URL
  audio_url: string | null; // local preview Blob URL
  created_at: string;
  is_page: boolean; // true if page_messages, false if messages
  conversation_id?: string | null; // for page_messages
  reply_to?: any;
  fileExt?: string;
  fileMime?: string;
}

export interface QueuedAIRequest {
  id: string;
  prompt: string;
  created_at: string;
}

class ClientNetworkManager {
  private listeners = new Set<(status: NetworkStatus) => void>();
  private currentStatus: NetworkStatus = "online";
  private db = new IndexedDBStore();
  private processingQueue = false;
  private retryDelay = 2000; // Starting backoff at 2s
  private maxRetryDelay = 30000;
  private pingInterval: any = null;
  /** Require consecutive hard failures before showing offline (VPN/jitter must not flap). */
  private consecutiveFailures = 0;
  private healthCheckInFlight: Promise<void> | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      this.currentStatus = navigator.onLine ? "online" : "offline";

      window.addEventListener("online", () => this.handleOnlineEvent());
      // Browser "offline" is flaky with VPN/blips — only trust if link layer is also gone.
      window.addEventListener("offline", () => {
        if (this.hasNetworkLink() === true) return;
        this.updateStatus("offline");
      });

      // Android: Wi‑Fi / mobile data present or fully gone (not ping/DNS validation).
      window.addEventListener("jj-native-network", ((e: CustomEvent) => {
        const online = !!e.detail?.online;
        const vpn = !!e.detail?.vpn;
        if (!online) {
          this.updateStatus("offline");
          return;
        }
        if (this.currentStatus === "offline") {
          this.updateStatus("reconnecting");
        }
        this.updateStatus(vpn ? "vpn" : "online");
      }) as EventListener);

      // Soft health: never flip banner to offline on ping failure while link is up.
      this.pingInterval = setInterval(() => this.checkConnectionHealth(), 20000);
      this.checkConnectionHealth();
    }
  }

  getStatus(): NetworkStatus {
    return this.currentStatus;
  }

  isOnline(): boolean {
    return (
      this.currentStatus === "online" ||
      this.currentStatus === "vpn" ||
      this.currentStatus === "reconnecting"
    );
  }

  subscribe(callback: (status: NetworkStatus) => void): () => void {
    this.listeners.add(callback);
    callback(this.currentStatus);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private updateStatus(newStatus: NetworkStatus) {
    if (this.currentStatus === newStatus) return;
    const prev = this.currentStatus;
    this.currentStatus = newStatus;
    console.log(`[NetworkManager] Status changed to: ${newStatus}`);
    this.listeners.forEach((cb) => cb(newStatus));

    if (
      (newStatus === "online" || newStatus === "vpn") &&
      (prev === "offline" || prev === "reconnecting")
    ) {
      this.reconnectRealtime();
      this.processQueues();
    }
  }

  private async handleOnlineEvent() {
    // Only show "Reconnecting..." when we were actually offline.
    if (this.currentStatus === "offline") {
      this.updateStatus("reconnecting");
    }
    await this.checkConnectionHealth();
  }

  /** External (Capacitor Network / UI) can force an immediate re-check. */
  forceHealthCheck() {
    return this.checkConnectionHealth();
  }

  /** True offline only when Wi‑Fi/mobile data link is actually gone. */
  reportNativeOffline() {
    if (this.hasNetworkLink() === true) return;
    this.updateStatus("offline");
  }

  /** Link restored — clear offline banner. */
  reportNativeOnline() {
    void this.handleOnlineEvent();
  }

  private detectVpnActive(): boolean {
    try {
      const bridge = (window as any).AndroidBridge;
      if (bridge && typeof bridge.isVpnActive === "function") {
        return !!bridge.isVpnActive();
      }
    } catch {
      /* ignore */
    }
    try {
      const conn = (navigator as any).connection;
      const type = String(conn?.type || conn?.effectiveType || "").toLowerCase();
      if (type.includes("vpn")) return true;
    } catch {
      /* ignore */
    }
    return false;
  }

  /**
   * Android link-layer: Wi‑Fi / cellular present?
   * null = bridge unavailable (web / not ready).
   */
  private hasNetworkLink(): boolean | null {
    try {
      const bridge = (window as any).AndroidBridge;
      if (bridge && typeof bridge.isInternetAvailable === "function") {
        return !!bridge.isInternetAvailable();
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  private async checkConnectionHealth() {
    if (typeof window === "undefined") return;
    if (this.healthCheckInFlight) return this.healthCheckInFlight;

    this.healthCheckInFlight = (async () => {
      const link = this.hasNetworkLink();

      // Phone: only offline when Wi‑Fi AND mobile data are gone.
      if (link === false) {
        this.updateStatus("offline");
        return;
      }

      if (link === true) {
        this.consecutiveFailures = 0;
        this.updateStatus(this.detectVpnActive() ? "vpn" : "online");
        // Optional silent ping — may reconnect realtime, never flips banner offline.
        void this.pingTest().then((ok) => {
          if (ok && (this.currentStatus === "online" || this.currentStatus === "vpn")) {
            /* keep status */
          }
        });
        return;
      }

      // Web / no bridge: trust navigator.onLine only (no ping→offline).
      if (!navigator.onLine) {
        this.updateStatus("offline");
        return;
      }
      this.consecutiveFailures = 0;
      this.updateStatus(this.detectVpnActive() ? "vpn" : "online");
    })().finally(() => {
      this.healthCheckInFlight = null;
    });

    return this.healthCheckInFlight;
  }

  /** Silent reachability probe — must not drive the offline banner. */
  private async pingTest(): Promise<boolean> {
    const url = import.meta.env.VITE_SUPABASE_URL;
    if (!url) return navigator.onLine;

    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${url}/rest/v1/`, {
        method: "HEAD",
        signal: controller.signal,
        cache: "no-store",
      });
      clearTimeout(id);
      return res.status > 0;
    } catch {
      return false;
    }
  }

  private reconnectRealtime() {
    try {
      const realtime = (supabase as any).realtime;
      if (realtime && typeof realtime.disconnect === "function" && typeof realtime.connect === "function") {
        console.log("[NetworkManager] Restoring realtime subscriptions cleanly...");
        realtime.disconnect();
        setTimeout(() => {
          realtime.connect();
          window.dispatchEvent(new CustomEvent("jj-network-restored"));
        }, 500);
      }
    } catch (e) {
      console.warn("Realtime reconnect failure:", e);
    }
  }

  // ── Offline Message & Media Blob Queue Management ─────────────────

  getMessageQueue(): QueuedMessage[] {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem("jj_offline_messages_queue") || "[]");
    } catch {
      return [];
    }
  }

  isMessageQueued(id: string): boolean {
    return this.getMessageQueue().some((x) => x.id === id);
  }

  private saveMessageQueue(queue: QueuedMessage[]) {
    if (typeof window === "undefined") return;
    localStorage.setItem("jj_offline_messages_queue", JSON.stringify(queue));
  }

  async queueMessage(
    msg: Omit<QueuedMessage, "id" | "created_at"> & { id?: string },
    mediaFile?: Blob
  ): Promise<string> {
    const id = msg.id || generateUUID();
    const queued: QueuedMessage = {
      ...msg,
      id,
      created_at: new Date().toISOString()
    } as any;

    if (mediaFile) {
      await this.db.set(`msg_media_${id}`, mediaFile);
    }

    const queue = this.getMessageQueue();
    // Prevent duplicate entries in the offline queue itself
    if (!queue.some((x) => x.id === id)) {
      queue.push(queued);
      this.saveMessageQueue(queue);
      console.log(`[NetworkManager] Queued message: ${id}`);
    }

    // Process queue immediately if we think we might be online
    if (this.isOnline()) {
      this.processQueues();
    }

    return id;
  }

  async removeMessageFromQueue(id: string) {
    const queue = this.getMessageQueue().filter((x) => x.id !== id);
    this.saveMessageQueue(queue);
    await this.db.delete(`msg_media_${id}`);
    window.dispatchEvent(new CustomEvent("jj-queue-updated"));
  }

  async markMessageFailed(id: string) {
    const queue = this.getMessageQueue().map((x) => 
      x.id === id ? { ...x, failed: true } : x
    );
    this.saveMessageQueue(queue as QueuedMessage[]);
    window.dispatchEvent(new CustomEvent("jj-queue-updated"));
  }

  // ── Offline AI Prompt Queue Management ────────────────────────────

  getAIQueue(): QueuedAIRequest[] {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem("jj_offline_ai_queue") || "[]");
    } catch {
      return [];
    }
  }

  private saveAIQueue(queue: QueuedAIRequest[]) {
    if (typeof window === "undefined") return;
    localStorage.setItem("jj_offline_ai_queue", JSON.stringify(queue));
  }

  queueAIRequest(prompt: string): string {
    const id = `user-msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const queued: QueuedAIRequest = {
      id,
      prompt,
      created_at: new Date().toISOString()
    };

    const queue = this.getAIQueue();
    queue.push(queued);
    this.saveAIQueue(queue);

    console.log(`[NetworkManager] Queued AI Request: ${id}`);

    if (this.isOnline()) {
      this.processQueues();
    }

    return id;
  }

  // ── Background Queue Processor with Exponential Backoff retry ──────

  async processQueues() {
    if (this.processingQueue) return;
    if (!this.isOnline()) return;

    this.processingQueue = true;
    console.log("[NetworkManager] Start processing offline queues...");

    try {
      // 1. Process standard chat message queue (preserves message order)
      let msgQueue = this.getMessageQueue();
      while (msgQueue.length > 0 && this.isOnline()) {
        const item = msgQueue[0];
        const success = await this.sendSingleMessage(item);
        if (success) {
          await this.removeMessageFromQueue(item.id);
          this.retryDelay = 2000; // Reset backoff delay on success
          msgQueue = this.getMessageQueue(); // Reload queue
        } else {
          // If sending fails, back off and retry later
          console.warn(`[NetworkManager] Failed to send queued message ${item.id}. Backing off...`);
          await this.markMessageFailed(item.id);
          this.scheduleRetry();
          break;
        }
      }

      // 2. Process AI request queue
      let aiQueue = this.getAIQueue();
      while (aiQueue.length > 0 && this.isOnline()) {
        const item = aiQueue[0];
        const success = await this.sendSingleAIRequest(item);
        if (success) {
          const updated = this.getAIQueue().filter((x) => x.id !== item.id);
          this.saveAIQueue(updated);
          aiQueue = this.getAIQueue(); // Reload
        } else {
          break;
        }
      }
    } catch (e) {
      console.error("[NetworkManager] Queue processing error:", e);
    } finally {
      this.processingQueue = false;
      window.dispatchEvent(new CustomEvent("jj-queue-processed"));
    }
  }

  private scheduleRetry() {
    console.log(`[NetworkManager] Scheduling retry in ${this.retryDelay}ms`);
    setTimeout(() => {
      this.retryDelay = Math.min(this.retryDelay * 2, this.maxRetryDelay);
      this.processQueues();
    }, this.retryDelay);
  }

  private async sendSingleMessage(item: QueuedMessage): Promise<boolean> {
    try {
      let finalImageUrl = item.image_url;
      let finalAudioUrl = item.audio_url;

      // check if we have offline media blob to upload first
      const storedBlob = await this.db.get(`msg_media_${item.id}`);
      if (storedBlob) {
        console.log(`[NetworkManager] Uploading offline media blob for ${item.id}`);
        // Import dynamically to avoid dependency cycles
        const { uploadAndSign } = await import("./chat-media");
        const bucket = item.image_url ? "chat-images" : "chat-audio";
        const ext = item.fileExt || (item.image_url ? "jpeg" : "wav");
        const mime = item.fileMime || (item.image_url ? "image/jpeg" : "audio/wav");

        const uploadedUrl = await uploadAndSign(bucket, item.sender_id, storedBlob, ext, mime);
        if (item.image_url) finalImageUrl = uploadedUrl;
        else finalAudioUrl = uploadedUrl;
      }

      const insertObj: any = {
        id: item.id, // client-generated stable UUID (duplicate protection)
        sender_id: item.sender_id,
        content: item.content,
        image_url: finalImageUrl,
        audio_url: finalAudioUrl,
        seen: false,
        delivered: true,
        created_at: item.created_at
      };

      const table = item.is_page ? "page_messages" : "messages";
      if (item.is_page) {
        insertObj.conversation_id = item.conversation_id;
        insertObj.from_page = false;
      } else {
        if (item.group_id) {
          insertObj.group_id = item.group_id;
        } else {
          insertObj.receiver_id = item.receiver_id;
        }
      }

      const { error } = await supabase.from(table).insert(insertObj);
      if (error) {
        // If message already exists in database (duplicate key error code 23505),
        // we count it as a success to avoid creating duplicate entries!
        if (error.code === "23505") {
          console.log(`[NetworkManager] Duplicate message code 23505 ignored for ${item.id}`);
          return true;
        }
        throw error;
      }

      console.log(`[NetworkManager] Successfully synchronized queued message: ${item.id}`);
      
      // Dispatch custom event to notify chat UI of sync completion
      window.dispatchEvent(
        new CustomEvent("jj-message-synchronized", {
          detail: { id: item.id, table, finalImageUrl, finalAudioUrl }
        })
      );

      return true;
    } catch (e) {
      console.error(`[NetworkManager] sendSingleMessage error for ${item.id}:`, e);
      return false;
    }
  }

  private async sendSingleAIRequest(item: QueuedAIRequest): Promise<boolean> {
    try {
      // Dispatch event to main UI to trigger submits to AI in order
      window.dispatchEvent(
        new CustomEvent("jj-ai-synchronized", {
          detail: { id: item.id, prompt: item.prompt }
        })
      );
      return true;
    } catch (e) {
      console.error(`[NetworkManager] sendSingleAIRequest error for ${item.id}:`, e);
      return false;
    }
  }

  // Force retry of failed queue messages manually
  async retryMessage(id: string) {
    const queue = this.getMessageQueue();
    const item = queue.find((x) => x.id === id);
    if (!item) {
      throw new Error("Message not found in offline queue");
    }

    const success = await this.sendSingleMessage(item);
    if (success) {
      await this.removeMessageFromQueue(id);
      this.retryDelay = 2000;
    } else {
      throw new Error("Retry failed. Still offline or connection timed out.");
    }
  }
}

export const NetworkManager = new ClientNetworkManager();
