import { supabase } from "@/integrations/supabase/client";

export const PROPERTY_PHOTO_BUCKET = "property-photos";
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

/**
 * Uploads a property image. Storage policies only accept paths whose first
 * folder is a property id inside the signed-in vendor's scope.
 */
export async function uploadPropertyPhoto(file: File, propertyId: string): Promise<string> {
  if (!ALLOWED.includes(file.type)) throw new Error("Upload a JPG, PNG or WebP image");
  if (file.size > MAX_BYTES) throw new Error("Image must be smaller than 8 MB");
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${propertyId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(PROPERTY_PHOTO_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return path;
}
