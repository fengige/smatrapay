import { supabase } from "@/integrations/supabase/client";

export const EVIDENCE_BUCKET = "meter-evidence";
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

/**
 * Uploads a photo into the signed-in vendor's own folder.
 * Storage policies only accept paths that start with the vendor's user id.
 */
export async function uploadEvidence(file: File, folder: string): Promise<string> {
  if (!ALLOWED.includes(file.type)) throw new Error("Upload a JPG, PNG or WebP image");
  if (file.size > MAX_BYTES) throw new Error("Image must be smaller than 8 MB");
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Your session expired — sign in again");
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${uid}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(EVIDENCE_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return path;
}

export async function evidenceUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(EVIDENCE_BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
