/** True when a chat media URL (stored in image_url) is a video clip. */
export function isChatVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const lower = url.split("?")[0]?.toLowerCase() || "";
  return (
    lower.endsWith(".webm") ||
    lower.endsWith(".mp4") ||
    lower.endsWith(".mov") ||
    lower.endsWith(".m4v") ||
    lower.includes("/video") ||
    /\.webm($|[?#])/.test(url) ||
    /\.mp4($|[?#])/.test(url)
  );
}

export function isChatVideoFile(file: Blob, filename?: string): boolean {
  const mime = (file.type || "").toLowerCase();
  if (mime.startsWith("video/")) return true;
  const ext = (filename?.split(".").pop() || "").toLowerCase();
  return ["webm", "mp4", "mov", "m4v"].includes(ext);
}

export const CHAT_VIDEO_ALLOWED_MIMES = [
  "video/webm",
  "video/mp4",
  "video/quicktime",
  "video/x-m4v",
] as const;

export const CHAT_VIDEO_ALLOWED_EXTS = ["webm", "mp4", "mov", "m4v"] as const;
