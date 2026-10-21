import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, setResponseHeader } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { residentCredentials, residentUsername, GENERIC_LOGIN_ERROR, GENERIC_RESET_MESSAGE, trustedRecoveryUrl, verifiedRecoveryClaims } from "./resident-password";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { residentDecision } from "./resident-signin";

async function prepare(username: string, action: "login" | "reset") {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const ip = getRequestHeader("cf-connecting-ip") ?? "shared-preview";
  const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map((b) => b.toString(16).padStart(2, "0")).join("");
  for (const [key, limit] of [[`${action}:account:${username}`, action === "login" ? 10 : 3], [`${action}:ip:${ip}`, action === "login" ? 50 : 10]] as const) {
    const { data, error } = await supabaseAdmin.rpc("consume_resident_auth_limit", { p_key: await hash(key), p_limit: limit, p_window: 900 });
    if (error) throw new Error("Authentication service unavailable. Please try again later.");
    if (!data) throw new Error("Too many attempts. Please try again in 15 minutes.");
  }
  const { data: profile, error } = await supabaseAdmin.from("users").select("id, status, username").ilike("username", username.replace(/_/g, "\\_")).maybeSingle();
  if (error) throw new Error("Authentication service unavailable. Please try again later.");
  if (!profile) return { supabaseAdmin, profile: null, email: null, roles: [] as string[] };
  const [auth, roles] = await Promise.all([
    supabaseAdmin.auth.admin.getUserById(profile.id),
    supabaseAdmin.from("user_roles").select("role").eq("user_id", profile.id),
  ]);
  if (auth.error || roles.error) throw new Error("Authentication service unavailable. Please try again later.");
  return { supabaseAdmin, profile, email: auth.data.user?.email ?? null, roles: (roles.data ?? []).map((r) => r.role) as string[] };
}

export const signInResidentPassword = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => residentCredentials.parse(d))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "no-store");
    const account = await prepare(data.username, "login");
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    const url = process.env["SUPABASE_URL"];
    if (!key || !url) throw new Error("Authentication service unavailable. Please try again later.");
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (input, init) => { const headers = new Headers(init?.headers); if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization"); headers.set("apikey", key); return fetch(input, { ...init, headers }); } },
    });
    const { data: signed, error } = await client.auth.signInWithPassword({ email: account.email ?? "unavailable-resident@invalid.example", password: data.password });
    if (error || !signed.session || !signed.user || signed.user.id !== account.profile?.id) {
      if (signed.session) await client.auth.signOut();
      throw new Error(error?.status && error.status >= 500 ? "Authentication service unavailable. Please try again later." : GENERIC_LOGIN_ERROR);
    }
    const decision = residentDecision({ profile: account.profile, roles: account.roles });
    if (!decision.ok) { await client.auth.signOut(); throw new Error(GENERIC_LOGIN_ERROR); }
    return { access_token: signed.session.access_token, refresh_token: signed.session.refresh_token };
  });

export const resetResidentPassword = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ username: residentUsername }).parse(d))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "no-store");
    const account = await prepare(data.username, "reset");
    if (account.email && residentDecision({ profile: account.profile, roles: account.roles }).ok) {
      // Never let untrusted input choose the email or redirect destination.
      await account.supabaseAdmin.auth.resetPasswordForEmail(account.email, { redirectTo: trustedRecoveryUrl(getRequestHeader("origin")) });
    }
    return { message: GENERIC_RESET_MESSAGE };
  });

export const completePasswordRecovery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ password: z.string().min(8).max(72).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/).regex(/[^A-Za-z0-9]/) }).parse(d))
  .handler(async ({ data, context }) => {
    setResponseHeader("Cache-Control", "no-store");
    if (!verifiedRecoveryClaims(context.claims)) throw new Error("This reset link is invalid or has expired. Request a new one.");
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    const bearer = getRequestHeader("authorization");
    if (!url || !key || !bearer) throw new Error("Password recovery is unavailable. Please try again later.");
    // The middleware client has a bearer header but no persisted Auth session;
    // update the verified recovery user through Auth, never the admin client.
    const response = await fetch(`${url}/auth/v1/user`, { method: "PUT", headers: { apikey: key, Authorization: bearer, "Content-Type": "application/json" }, body: JSON.stringify({ password: data.password }) });
    if (!response.ok) throw new Error("Could not update your password. Request a fresh reset link and try again.");
    return { ok: true };
  });