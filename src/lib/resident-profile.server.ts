import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export async function ownResident(client: SupabaseClient<Database>, id: string) {
  const [role, profile] = await Promise.all([client.rpc("has_role", { _user_id: id, _role: "resident" }), client.from("users").select("id,name,email,username,phone,address,id_number,bio,status,profile_image,created_at").eq("id", id).maybeSingle()]);
  if (role.error || !role.data || profile.error || profile.data?.status !== "active") throw new Error("An active resident account is required.");
  return profile.data;
}
export async function profileAudit(id: string, action: string, status: "success" | "failed" | "attempt", details: Record<string, string | boolean | null> = {}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("user_audit_logs").insert({ user_id: id, actor_id: id, action: `resident_${action}_${status}`, changes: { ...details, status } });
  if (error) throw new Error("Could not record account security activity. Please try again.");
}