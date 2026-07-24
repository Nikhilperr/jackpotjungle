import { supabase } from "@/integrations/supabase/client";
import { NetworkManager } from "./network-manager";

/** Avatar / profile image formats (no animated GIF). */
export const AVATAR_ALLOWED_MIMES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/heic",
  "image/heif",
] as const;

export const AVATAR_ALLOWED_EXTS = [
  "jpg",
  "jpeg",
  "png",
  "webp",
  "avif",
  "heic",
  "heif",
] as const;

export const CHAT_IMAGE_ALLOWED_MIMES = [
  ...AVATAR_ALLOWED_MIMES,
] as const;

export const CHAT_IMAGE_ALLOWED_EXTS = [
  ...AVATAR_ALLOWED_EXTS,
] as const;

export function isAnimatedGif(file: Blob, filename?: string): boolean {
  const mime = (file.type || "").toLowerCase();
  const ext = (filename?.split(".").pop() || "").toLowerCase();
  return mime === "image/gif" || ext === "gif";
}

/**
 * Validate a profile/avatar image. Rejects animated GIFs.
 * Returns null when valid, or an error message.
 */
export function validateAvatarFile(file: Blob, filename?: string): string | null {
  if (isAnimatedGif(file, filename)) {
    return "Animated GIFs are not allowed for profile pictures. Please use JPEG, PNG, WEBP, or AVIF.";
  }
  const mime = (file.type || "").toLowerCase();
  const ext = (filename?.split(".").pop() || "").toLowerCase();
  const mimeOk = !mime || AVATAR_ALLOWED_MIMES.includes(mime as any) || mime.startsWith("image/");
  const extOk = !ext || AVATAR_ALLOWED_EXTS.includes(ext as any);
  if (!mimeOk && !extOk) {
    return "Unsupported format. Please choose JPEG, PNG, WEBP, AVIF, or HEIC.";
  }
  // Explicitly block gif even if mime is empty but we somehow missed
  if (ext === "gif") {
    return "Animated GIFs are not allowed for profile pictures.";
  }
  return null;
}

/**
 * Compress / resize static images (Messenger-style).
 * Always downscales when over maxDimension OR re-encodes when over sizeThreshold.
 */
async function compressImage(
  file: Blob,
  sizeThreshold: number,
  maxDimension = 1600,
  quality = 0.75,
): Promise<Blob> {
  if (
    typeof window === "undefined" ||
    typeof document === "undefined" ||
    !file.type.startsWith("image/") ||
    file.type === "image/gif" ||
    file.type === "image/svg+xml"
  ) {
    return file;
  }

  // Already small enough — keep original (webp/avif/png quality preserved)
  if (file.size <= sizeThreshold) {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.src = objectUrl;
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let width = img.width;
      let height = img.height;
      const needsResize = width > maxDimension || height > maxDimension;

      if (needsResize) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Prefer webp when the browser supports it (smaller); else jpeg.
      const preferWebp =
        typeof canvas.toBlob === "function" &&
        (() => {
          try {
            return canvas.toDataURL("image/webp").startsWith("data:image/webp");
          } catch {
            return false;
          }
        })();

      const outType = preferWebp ? "image/webp" : "image/jpeg";
      canvas.toBlob(
        (blob) => {
          if (blob && blob.size < file.size) {
            resolve(blob);
          } else if (blob && needsResize) {
            // Resized but not smaller — still use it (dimensions win for chat UX)
            resolve(blob);
          } else {
            resolve(file);
          }
        },
        outType,
        quality,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };
  });
}

/**
 * Light client-side video re-encode via MediaRecorder (lower bitrate).
 * Falls back to the original file if unsupported or on failure.
 */
async function compressVideo(file: Blob, maxBytes = 8 * 1024 * 1024): Promise<Blob> {
  if (typeof window === "undefined" || !file.type.startsWith("video/")) {
    return file;
  }
  if (file.size <= maxBytes) {
    return file;
  }
  if (typeof MediaRecorder === "undefined") {
    return file;
  }

  try {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.src = objectUrl;

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("video load failed"));
    });

    const stream =
      typeof (video as any).captureStream === "function"
        ? (video as any).captureStream()
        : typeof (video as any).mozCaptureStream === "function"
          ? (video as any).mozCaptureStream()
          : null;

    if (!stream) {
      URL.revokeObjectURL(objectUrl);
      return file;
    }

    const mimeCandidates = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ];
    const mime = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || "";
    if (!mime) {
      URL.revokeObjectURL(objectUrl);
      return file;
    }

    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: 1_200_000,
    });

    const done = new Promise<Blob>((resolve) => {
      recorder.ondataavailable = (e) => {
        if (e.data?.size) chunks.push(e.data);
      };
      recorder.onstop = () => {
        resolve(new Blob(chunks, { type: mime.split(";")[0] }));
      };
    });

    recorder.start(200);
    await video.play();
    await new Promise<void>((resolve) => {
      video.onended = () => resolve();
      // Safety timeout for long/broken videos
      window.setTimeout(() => resolve(), Math.min((video.duration || 30) * 1000 + 2000, 90_000));
    });
    if (recorder.state !== "inactive") recorder.stop();
    video.pause();
    URL.revokeObjectURL(objectUrl);

    const out = await done;
    if (out.size > 0 && out.size < file.size) return out;
    return file;
  } catch (e) {
    console.warn("Client-side video compression failed, uploading original:", e);
    return file;
  }
}

export async function uploadAndSign(
  bucket: "avatars" | "chat-images" | "chat-audio",
  userId: string,
  file: Blob,
  ext: string,
  contentType?: string,
  opts?: { filename?: string },
): Promise<string> {
  if (!NetworkManager.isOnline()) {
    throw new Error("Network is offline. Queueing file for later upload.");
  }

  let finalFile = file;
  let finalExt = ext;
  let finalContentType = contentType ?? file.type;

  // Profile pictures: never allow animated GIFs
  if (bucket === "avatars") {
    const err = validateAvatarFile(file, opts?.filename || `file.${ext}`);
    if (err) throw new Error(err);
  }

  // Compress static images (chat + avatars)
  if (
    bucket !== "chat-audio" &&
    finalFile.type.startsWith("image/") &&
    finalFile.type !== "image/gif"
  ) {
    const sizeThreshold = bucket === "avatars" ? 80 * 1024 : 250 * 1024;
    const maxDimension = bucket === "avatars" ? 512 : 1440;
    const quality = bucket === "avatars" ? 0.82 : 0.72;

    try {
      const compressed = await compressImage(finalFile, sizeThreshold, maxDimension, quality);
      if (compressed !== finalFile) {
        finalFile = compressed;
        if (compressed.type === "image/webp") {
          finalExt = "webp";
          finalContentType = "image/webp";
        } else {
          finalExt = "jpeg";
          finalContentType = "image/jpeg";
        }
      }
    } catch (e) {
      console.warn("Client-side image compression failed, uploading original:", e);
    }
  }

  // Compress videos when present (future-proof / offline queue)
  if (finalFile.type.startsWith("video/")) {
    try {
      const compressed = await compressVideo(finalFile);
      if (compressed !== finalFile) {
        finalFile = compressed;
        finalExt = compressed.type.includes("webm") ? "webm" : finalExt;
        finalContentType = compressed.type || finalContentType;
      }
    } catch (e) {
      console.warn("Client-side video compression failed, uploading original:", e);
    }
  }

  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${finalExt}`;
  const { error: upErr } = await supabase.storage
    .from(bucket)
    .upload(path, finalFile, { contentType: finalContentType, upsert: false });
  if (upErr) throw upErr;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
