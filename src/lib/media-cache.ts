const CACHE_NAME = "jj-media-cache";
const MAX_CACHE_ITEMS = 200;
const EVICT_TARGET_ITEMS = 180;
const METADATA_KEY = "jj_media_cache_metadata";

// Memory maps to store resolved blob URLs
const persistentCacheMap = new Map<string, string>();
const volatileCacheMap = new Map<string, { blobUrl: string; refCount: number }>();

interface CacheMetadata {
  [url: string]: number; // url -> last accessed timestamp
}

function getMetadata(): CacheMetadata {
  if (typeof window === "undefined") return {};
  try {
    const data = localStorage.getItem(METADATA_KEY);
    return data ? JSON.parse(data) : {};
  } catch (e) {
    return {};
  }
}

function updateMetadata(url: string) {
  if (typeof window === "undefined") return;
  try {
    const meta = getMetadata();
    meta[url] = Date.now();
    localStorage.setItem(METADATA_KEY, JSON.stringify(meta));
  } catch (e) {}
}

async function evictOldestIfNeeded() {
  if (typeof window === "undefined" || !window.caches) return;
  try {
    const meta = getMetadata();
    const urls = Object.keys(meta);
    if (urls.length <= MAX_CACHE_ITEMS) return;

    // Sort by timestamp ascending (oldest first)
    const sorted = urls.map(url => ({ url, ts: meta[url] }))
                       .sort((a, b) => a.ts - b.ts);

    const toEvictCount = urls.length - EVICT_TARGET_ITEMS;
    const toEvict = sorted.slice(0, toEvictCount);

    const cache = await window.caches.open(CACHE_NAME);
    for (const item of toEvict) {
      await cache.delete(item.url);
      delete meta[item.url];
    }

    localStorage.setItem(METADATA_KEY, JSON.stringify(meta));
  } catch (e) {
    console.warn("Failed to evict media cache items:", e);
  }
}

/**
 * Resolves a remote media URL to a local blob URL.
 * If cachePolicy is "persistent", it stays in memory forever.
 * If cachePolicy is "volatile", it uses reference counting and should be released when unmounted.
 */
export async function getCachedMedia(
  url: string,
  cachePolicy: "persistent" | "volatile" = "volatile"
): Promise<string> {
  if (!url) return "";

  // Skip local files, data URLs, and blob URLs
  if (
    url.startsWith("data:") ||
    url.startsWith("blob:") ||
    url.startsWith("file:") ||
    url.startsWith("/") ||
    url.includes("localhost") ||
    url.includes("127.0.0.1")
  ) {
    return url;
  }

  // 1. Check in-memory maps
  if (persistentCacheMap.has(url)) {
    updateMetadata(url);
    return persistentCacheMap.get(url)!;
  }

  if (volatileCacheMap.has(url)) {
    const entry = volatileCacheMap.get(url)!;
    entry.refCount++;
    updateMetadata(url);
    return entry.blobUrl;
  }

  // If caches API is not supported, fetch directly
  if (typeof window === "undefined" || !window.caches) {
    return url;
  }

  // 2. Resolve via Cache Storage API or network fetch
  try {
    const cache = await window.caches.open(CACHE_NAME);
    let response = await cache.match(url);

    if (response) {
      updateMetadata(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      if (cachePolicy === "persistent") {
        persistentCacheMap.set(url, blobUrl);
      } else {
        volatileCacheMap.set(url, { blobUrl, refCount: 1 });
      }

      return blobUrl;
    }

    // Fetch from network and save to cache
    const networkResponse = await fetch(url);
    if (networkResponse.ok) {
      await cache.put(url, networkResponse.clone());
      updateMetadata(url);
      
      const blob = await networkResponse.blob();
      const blobUrl = URL.createObjectURL(blob);

      if (cachePolicy === "persistent") {
        persistentCacheMap.set(url, blobUrl);
      } else {
        volatileCacheMap.set(url, { blobUrl, refCount: 1 });
      }

      // Check eviction asynchronously to not block loading
      setTimeout(evictOldestIfNeeded, 50);

      return blobUrl;
    }
  } catch (err) {
    console.warn("Failed to retrieve from media cache, falling back to network url:", url, err);
  }

  return url;
}

/**
 * Decreases the reference count of a volatile cached URL.
 * If the reference count drops to 0, the Blob URL is revoked and deleted.
 */
export function releaseCachedMedia(url: string): void {
  if (!url || !url.startsWith("blob:")) return;

  // Search the volatile cache map for this blob URL
  for (const [key, entry] of volatileCacheMap.entries()) {
    if (entry.blobUrl === url) {
      entry.refCount--;
      if (entry.refCount <= 0) {
        URL.revokeObjectURL(entry.blobUrl);
        volatileCacheMap.delete(key);
      }
      break;
    }
  }
}
