import { supabase } from "@/integrations/supabase/client";

// 10 years — effectively permanent for our use case
const LONG_EXPIRY = 60 * 60 * 24 * 365 * 10;

export async function uploadAndSign(
  bucket: "avatars" | "chat-images" | "chat-audio",
  userId: string,
  file: Blob,
  ext: string,
  contentType?: string,
): Promise<string> {
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from(bucket)
    .upload(path, file, { contentType: contentType ?? (file as File).type ?? undefined, upsert: false });
  if (upErr) throw upErr;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
