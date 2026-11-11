import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { eligibleLandlordAccountRoles } from "./landlord-account";
import { assertVendor } from "./vendor.server";
import { readAll } from "./landlord-scope.server";

type Client = SupabaseClient<Database>;

export async function authorizeLandlordAccount(client: Client, actorId: string, id: string) {
  await assertVendor({ supabase: client, userId: actorId } as never);
  if (actorId === id) throw new Error("Access denied.");
  const profile = await client.from("users").select("id, name, email, status, created_by").eq("id", id).maybeSingle();
  if (profile.error || !profile.data) throw new Error("Access denied.");
  if (profile.data.created_by !== actorId) {
    const [properties, links] = await Promise.all([
      readAll(() => client.from("properties").select("id").eq("landlord_id", id).order("id")),
      readAll(() => client.from("property_landlords").select("property_id").eq("landlord_id", id).order("id")),
    ]);
    const ids = [...new Set([...properties.map(p => p.id), ...links.map(p => p.property_id)])];
    let managed = false;
    for (const propertyId of ids) {
      const result = await client.rpc("can_manage_property_landlords", { p_property: propertyId });
      if (!result.error && result.data === true) { managed = true; break; }
    }
    if (!managed) throw new Error("You can only change passwords for landlords linked to properties you manage.");
  }
  return { id: profile.data.id, name: profile.data.name, email: profile.data.email, status: profile.data.status };
}

export async function managedLandlordAccount(admin: Client, id: string) {
  const [roles, account] = await Promise.all([
    admin.from("user_roles").select("role").eq("user_id", id),
    admin.auth.admin.getUserById(id),
  ]);
  if (roles.error || account.error || account.data.user?.id !== id || !eligibleLandlordAccountRoles((roles.data ?? []).map(r => r.role))) {
    throw new Error("This account is not eligible for landlord password management.");
  }
}

export async function applyLandlordPassword(admin: Client, actorId: string, id: string, password: string) {
  const attempt = await admin.from("user_audit_logs").insert({ user_id: id, actor_id: actorId, action: "landlord_password_change_attempted", changes: { outcome: "requested" } });
  if (attempt.error) throw new Error("Password update is unavailable. Please try again later.");
  const result = await admin.auth.admin.updateUserById(id, { password });
  const success = !result.error && result.data.user?.id === id;
  const audit = await admin.from("user_audit_logs").insert({ user_id: id, actor_id: actorId, action: success ? "landlord_password_changed" : "landlord_password_change_failed", changes: { outcome: success ? "success" : "failed" } });
  if (!success) throw new Error("Could not update the landlord’s password. Please try again.");
  const notification = await admin.from("notifications").insert({ user_id: id, type: "account_security", title: "Password changed", message: "Your password was changed by an authorized vendor account manager. Contact support if you did not expect this change.", resource_type: "landlord", resource_id: id });
  return { ok: true, auditRecorded: !audit.error, landlordNotified: !notification.error };
}