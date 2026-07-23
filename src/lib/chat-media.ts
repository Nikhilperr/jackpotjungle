import { supabase } from "@/integrations/supabase/client";

async function compressImage(
  file: Blob,
  sizeThreshold: number,
  maxDimension = 1600,
  quality = 0.75
): Promise<Blob> {
  if (
    typeof window === "undefined" || 
    typeof document === "undefined" || 
    !file.type.startsWith("image/") || 
    file.type === "image/gif"
  ) {
    return file;
  }

  // Skip if size is under threshold
  if (file.size <= sizeThreshold) {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      
      let width = img.width;
      let height = img.height;

      // Skip compression/resizing if source dimensions are already under target limits
      if (width <= maxDimension && height <= maxDimension) {
        resolve(file);
        return;
      }

      // Calculate downscaled dimensions (never upscale)
      if (width > maxDimension || height > maxDimension) {
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

      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              resolve(file);
            }
          },
          "image/jpeg",
          quality
        );
      } else {
        resolve(file);
      }
    };
    img.onerror = () => {
      resolve(file);
    };
  });
}

import { NetworkManager } from "./network-manager";

export async function uploadAndSign(
  bucket: "avatars" | "chat-images" | "chat-audio",
  userId: string,
  file: Blob,
  ext: string,
  contentType?: string,
): Promise<string> {
  if (!NetworkManager.isOnline()) {
    throw new Error("Network is offline. Queueing file for later upload.");
  }
  let finalFile = file;
  let finalExt = ext;
  let finalContentType = contentType ?? file.type;

  // Compress static images
  if (bucket !== "chat-audio" && file.type.startsWith("image/") && file.type !== "image/gif") {
    const sizeThreshold = bucket === "avatars" ? 100 * 1024 : 300 * 1024;
    const maxDimension = bucket === "avatars" ? 400 : 1200;
    const quality = bucket === "avatars" ? 0.8 : 0.75;

    try {
      finalFile = await compressImage(file, sizeThreshold, maxDimension, quality);
      if (finalFile !== file) {
        finalExt = "jpeg";
        finalContentType = "image/jpeg";
      }
    } catch (e) {
      console.warn("Client-side image compression failed, uploading original:", e);
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
