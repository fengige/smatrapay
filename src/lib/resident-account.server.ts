import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { eligibleResidentRoles } from "./resident-account";

type Client = SupabaseClient<Database>;
type Target = { id: string; portal: "admin" | "vendor" };
export async function authorizeResidentAccount(client: Client, actorId: string, target: Target) {
  const { data: allowed, error: roleError } = await client.rpc("has_role", { _user_id: actorId, _role: target.portal });
  if (roleError || !allowed || actorId === target.id) throw new Error("Access denied.");
  // This query uses the caller's RLS client: vendor visibility is resolved by
  // the existing vendor_scope_resident_ids relationship, never an input owner ID.
  const { data: profile, error } = await client.from("users").select("id, name, username, status").eq("id", target.id).maybeSingle();
  if (error || !profile) throw new Error("Access denied.");
  if (target.portal === "vendor") {
    const assignment = await client.from("unit_assignments").select("id").eq("user_id", target.id).eq("role", "resident").is("end_date", null).limit(1).maybeSingle();
    if (assignment.error || !assignment.data) throw new Error("Access denied.");
  }
  return profile;
}

export async function managedResidentAccount(admin: Client, id: string) {
  const [roles, account] = await Promise.all([
    admin.from("user_roles").select("role").eq("user_id", id),
    admin.auth.admin.getUserById(id),
  ]);
  if (roles.error || account.error || !account.data.user || !eligibleResidentRoles((roles.data ?? []).map((r) => r.role))) {
    throw new Error("This account is not eligible for resident password management.");
  }
}

export async function applyResidentPassword(admin: Client, actorId: string, targetId: string, password: string) {
  // Commit an attempt before changing Auth; if audit storage is unavailable,
  // no password is changed. Password values never enter audit records.
  const attempt = await admin.from("user_audit_logs").insert({ user_id: targetId, actor_id: actorId, action: "resident_password_change_attempted", changes: { outcome: "requested" } });
  if (attempt.error) throw new Error("Password update is unavailable. Please try again later.");
  const result = await admin.auth.admin.updateUserById(targetId, { password });
  const success = !result.error && result.data.user?.id === targetId;
  const completed = await admin.from("user_audit_logs").insert({ user_id: targetId, actor_id: actorId, action: success ? "resident_password_changed" : "resident_password_change_failed", changes: { outcome: success ? "success" : "failed" } });
  if (!success) throw new Error("Could not update the resident’s password. Please try again.");
  const notification = await admin.from("notifications").insert({ user_id: targetId, type: "account_security", title: "Password changed", message: "Your password was changed by an authorized account manager. Contact support if you did not expect this change.", resource_type: "resident", resource_id: targetId });
  return { ok: true, auditRecorded: !completed.error, residentNotified: !notification.error };
}