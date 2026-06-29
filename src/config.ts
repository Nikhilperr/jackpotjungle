// Centralized Service URLs configuration
export const SERVICES_CONFIG = {
  PUBLIC_WEBSITE: "https://playjackpotjungle.com",
  APPLICATION: "https://playjackpotjungle.com/app",
  ADMIN: "https://admin.playjackpotjungle.com",
  CHAT: "https://chat.playjackpotjungle.com",
  API: "https://api.playjackpotjungle.com",
  WS: "https://ws.playjackpotjungle.com",
  CDN: "https://cdn.playjackpotjungle.com",
};

/**
 * Maps a default storage URL to the CDN subdomain
 */
export function toCDNUrl(publicUrl: string | null | undefined): string {
  if (!publicUrl) return "";
  
  // Skip blob or data URIs
  if (publicUrl.startsWith("data:") || publicUrl.startsWith("blob:")) {
    return publicUrl;
  }
  
  const supabaseUrl = "https://db.chancerealm.casino";
  const storagePrefix = `${supabaseUrl}/storage/v1/object/public`;
  
  if (publicUrl.startsWith(storagePrefix)) {
    // e.g. https://db.chancerealm.casino/storage/v1/object/public/avatars/abc.png
    // becomes https://cdn.playjackpotjungle.com/avatars/abc.png
    return publicUrl.replace(storagePrefix, SERVICES_CONFIG.CDN);
  }
  
  return publicUrl;
}
