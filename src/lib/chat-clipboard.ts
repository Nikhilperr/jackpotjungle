import { toCDNUrl } from "@/config";
import { isChatVideoUrl } from "@/lib/chat-video";
import { toast } from "sonner";

/** Strip reply / system wrappers so copied text is paste-ready. */
export function plainTextFromMessageContent(content: string | null | undefined): string {
  if (!content) return "";
  let text = content;
  if (text.startsWith("[reply:")) {
    const match = text.match(/^\[reply:[^\]]*\]\s*([\s\S]*)/);
    if (match) text = match[1] ?? "";
  }
  if (text.startsWith("[system:forwarded]")) {
    text = text.slice("[system:forwarded]".length).trim();
  }
  if (text.startsWith("[system:")) return "";
  return text.trim();
}

async function fetchBlob(url: string): Promise<Blob> {
  const res = await fetch(url, { mode: "cors", credentials: "omit" });
  if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
  return res.blob();
}

async function blobToPng(blob: Blob): Promise<Blob> {
  if (blob.type === "image/png") return blob;
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return blob;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (png) return png;
  }
  // Fallback via Image element
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = "anonymous";
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Image decode failed"));
      el.src = objectUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return blob;
    ctx.drawImage(img, 0, 0);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    return png || blob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function writeImageClipboard(blob: Blob): Promise<boolean> {
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) return false;
  const png = await blobToPng(blob);
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
    return true;
  } catch {
    // Some WebViews only accept a promise-valued ClipboardItem
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "image/png": Promise.resolve(png),
        } as any),
      ]);
      return true;
    } catch {
      return false;
    }
  }
}

async function writeTextClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

function guessFilename(url: string, mime: string): string {
  const path = url.split("?")[0] || "";
  const base = path.split("/").pop() || "";
  if (base && /\.[a-z0-9]{2,5}$/i.test(base)) return base;
  if (mime.startsWith("video/")) return `jackpot-jungle-${Date.now()}.mp4`;
  if (mime === "image/png") return `jackpot-jungle-${Date.now()}.png`;
  if (mime === "image/webp") return `jackpot-jungle-${Date.now()}.webp`;
  return `jackpot-jungle-${Date.now()}.jpg`;
}

/**
 * Copy a chat message to the system clipboard for paste anywhere:
 * - photos → image/png
 * - text → plain text (reply wrappers stripped)
 */
export async function copyChatMessage(msg: {
  content?: string | null;
  image_url?: string | null;
  audio_url?: string | null;
}): Promise<void> {
  const imageUrl = msg.image_url ? toCDNUrl(msg.image_url) || msg.image_url : null;
  const text = plainTextFromMessageContent(msg.content);

  if (imageUrl && !isChatVideoUrl(imageUrl)) {
    try {
      let blob: Blob;
      try {
        blob = await fetchBlob(imageUrl);
      } catch {
        // CORS/fetch blocked — decode via <img> + canvas
        blob = await blobToPng(await (async () => {
          const objectUrl = imageUrl;
          const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new Image();
            el.crossOrigin = "anonymous";
            el.onload = () => resolve(el);
            el.onerror = () => reject(new Error("Image load failed"));
            el.src = objectUrl;
          });
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Canvas unavailable");
          ctx.drawImage(img, 0, 0);
          const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
          if (!png) throw new Error("PNG encode failed");
          return png;
        })());
      }
      const ok = await writeImageClipboard(blob.type === "image/png" ? blob : await blobToPng(blob));
      if (ok) {
        toast.success("Photo copied — paste anywhere");
        return;
      }
    } catch (e) {
      console.warn("copy image failed", e);
    }
    // Fallback: at least copy the URL so something lands on the clipboard
    if (await writeTextClipboard(imageUrl)) {
      toast.success("Photo link copied");
      return;
    }
    toast.error("Could not copy photo");
    return;
  }

  if (imageUrl && isChatVideoUrl(imageUrl)) {
    toast.message("Use download to save videos");
    return;
  }

  if (text) {
    const ok = await writeTextClipboard(text);
    if (ok) toast.success("Copied to clipboard");
    else toast.error("Could not copy");
    return;
  }

  if (msg.audio_url) {
    toast.message("Voice messages can't be copied");
    return;
  }

  toast.error("Nothing to copy");
}

/** Download a chat photo/video to the device. */
export async function downloadChatMedia(url: string): Promise<void> {
  const resolved = toCDNUrl(url) || url;
  try {
    const blob = await fetchBlob(resolved);
    const filename = guessFilename(resolved, blob.type || "image/jpeg");
    const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });

    // Prefer native share sheet on mobile (saves to Photos / Files).
    const nav = navigator as Navigator & {
      canShare?: (data: ShareData) => boolean;
      share?: (data: ShareData) => Promise<void>;
    };
    if (nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
      try {
        await nav.share({ files: [file], title: filename });
        toast.success("Saved");
        return;
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        // fall through to anchor download
      }
    }

    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
    toast.success("Download started");
  } catch (e) {
    console.error(e);
    // Last resort: open in new tab so user can save manually
    try {
      window.open(resolved, "_blank", "noopener,noreferrer");
      toast.message("Opened photo — long-press to save");
    } catch {
      toast.error("Download failed");
    }
  }
}
