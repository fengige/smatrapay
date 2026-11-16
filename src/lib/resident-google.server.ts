import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { residentGoogleError } from "./resident-google";

/** No browser email or target user ID: SQL reads the authenticated Google identity. */
export async function requireResidentGoogle(client: SupabaseClient<Database>) {
  const { data, error } = await client.rpc("resident_google_access");
  if (error) throw new Error("We couldn't verify your resident account. Please try again.");
  const message = residentGoogleError(data ?? "unverified");
  if (message) throw new Error(message);
}