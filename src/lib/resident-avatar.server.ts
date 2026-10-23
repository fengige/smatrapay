import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { residentAvatarSource } from "./resident-avatar";

/** Only pass records already authorized by the calling handler's role/RLS checks.
 * Vendors cannot sign resident objects via storage RLS; sign only these scoped rows.
 * This is a server-only helper, not a callable endpoint accepting arbitrary paths.
 */
export async function residentAvatarUrls(
  rows: { id: string; profile_image: string | null }[],
  storageClient?: SupabaseClient<Database>,
) {
  const sources = rows.map(row => ({ id: row.id, source: residentAvatarSource(row.profile_image, row.id) }));
  const urls = new Map<string, string | null>(sources.map(({ id, source }) => [id, source && "url" in source ? source.url ?? null : null]));
  const paths = [...new Set(sources.flatMap(({ source }) => source && "path" in source && source.path ? [source.path] : []))];
  if (!paths.length) return urls;
  const client = storageClient ?? (await import("@/integrations/supabase/client.server")).supabaseAdmin;
  try {
    const signed = await client.storage.from("avatars").createSignedUrls(paths, 600);
    const browserOrigin = import.meta.env.VITE_SUPABASE_URL;
    const signedByPath = new Map((signed.data ?? []).map(item => {
      let url = item.signedUrl || null;
      // Storage signatures cover the object path, not the internal server origin.
      if (url && browserOrigin) {
        try {
          const parsed = new URL(url);
          url = `${browserOrigin.replace(/\/$/, "")}${parsed.pathname}${parsed.search}`;
        } catch { url = null; }
      }
      return [item.path, url] as const;
    }));
    for (const { id, source } of sources) {
      if (source && "path" in source) urls.set(id, signedByPath.get(source.path) ?? null);
    }
  } catch { /* Unavailable photos must not prevent the resident page from loading. */ }
  return urls;
}