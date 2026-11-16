import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { requiresSecondFactor } from "./resident-profile";
import { isGoogleSession } from "./resident-google";

/** Covers every signed-in RPC, including Google/password sessions and shared job reads. */
export const enforceResidentMfa = createMiddleware({ type: "function" }).server(async ({ next, serverFnMeta }) => {
  const bearer = getRequestHeader("authorization");
  if (!bearer) return next();
  const url = process.env["SUPABASE_URL"]; const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return next();
  const response = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: bearer } });
  if (!response.ok) throw new Error("Your session has expired. Sign in again.");
  const user = await response.json();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const roles = await supabaseAdmin.from("user_roles").select("role").eq("user_id", user.id);
  if (roles.error) throw new Error("Could not verify account security.");
  // Staff accounts are unchanged, even when they also have the default resident role.
  const values = (roles.data ?? []).map(r => r.role);
  if (values.some(r => r !== "resident" && r !== "user")) return next();
  const token = bearer.replace(/^Bearer /, "");
  const payload = token.split(".")[1];
  let claims;
  try { claims = JSON.parse(atob((payload ?? "").replaceAll("-", "+").replaceAll("_", "/"))); } catch { throw new Error("Invalid session."); }
  // Claims are trusted only after /user has validated this exact bearer token.
  if (isGoogleSession(user, claims)) {
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: bearer } } });
    const { requireResidentGoogle } = await import("./resident-google.server");
    await requireResidentGoogle(client);
  }
  if (serverFnMeta.name !== "residentMfa" && serverFnMeta.name !== "verifyResidentGoogle" && requiresSecondFactor(values, user.factors ?? [], claims.aal)) throw new Error("Verify your authenticator to continue.");
  return next();
});