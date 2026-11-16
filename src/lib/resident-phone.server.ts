import { createClient } from "@supabase/supabase-js";
import { PHONE_LOGIN_ERROR, phoneHash, randomPhoneCode } from "./resident-phone";
import { residentDecision } from "./resident-signin";

type Db = any;
const RESIDENT_SMS_PROVIDER = "tiara";
const RESIDENT_SMS_SENDER = "REZICOM";

export async function limitResidentPhone(db: Db, action: "send" | "verify", identifier: string, ip: string) {
  const limits = action === "send"
    ? [[`phone:cooldown:${identifier}`, 1, 60], [`phone:send:${identifier}`, 3, 900], [`phone:send:ip:${ip}`, 10, 900]] as const
    : [[`phone:verify:${identifier}`, 5, 300], [`phone:verify:ip:${ip}`, 30, 900]] as const;
  for (const [key, limit, window] of limits) {
    const result = await db.rpc("consume_resident_auth_limit", { p_key: await phoneHash(key), p_limit: limit, p_window: window });
    if (result.error) throw new Error("Phone sign-in is temporarily unavailable. Please try again later.");
    if (!result.data) throw new Error("Too many attempts. Please wait before trying again.");
  }
}

/** Uses TIARACONNECT credentials with the resident-only REZICOM sender. */
export async function deliverResidentPhoneCode(db: Db, phone: string, code: string, challenge: string, send: typeof fetch = fetch): Promise<boolean> {
  const { data: config, error } = await db.from("sms_configurations").select("id,provider_code,api_key,api_url").eq("is_active", true).eq("provider_code", RESIDENT_SMS_PROVIDER).maybeSingle();
  if (error || !config || config.provider_code !== RESIDENT_SMS_PROVIDER || !config.api_key || !config.api_url) return false;
  const ref = `resident-otp-${challenge}`;
  const { data: log, error: logError } = await db.from("sms_messages").insert({ configuration_id: config.id, recipient_phone: phone.slice(1), message: "[Resident sign-in code: redacted]", sender_id: RESIDENT_SMS_SENDER, ref_id: ref, status: "pending" }).select("id").single();
  if (logError || !log) return false;
  let ok = false;
  try {
    const response = await send(config.api_url, { method: "POST", redirect: "error", signal: AbortSignal.timeout(15000), headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.api_key}` }, body: JSON.stringify({ from: RESIDENT_SMS_SENDER, to: phone.slice(1), message: `SmatraPay sign-in code: ${code}. Expires in 5 minutes. Do not share this code.`, refId: ref }) });
    if (response.ok) {
      const result = await response.json();
      ok = String(result.status).toUpperCase() === "SUCCESS" && String(result.statusCode) === "0";
    }
  } catch { /* Never log provider bodies: they can echo OTPs or credentials. */ }
  await db.from("sms_messages").update({ status: ok ? "submitted" : "failed", error_message: ok ? null : "Sign-in SMS could not be confirmed.", ...(ok ? { sent_at: new Date().toISOString() } : {}) }).eq("id", log.id);
  return ok;
}

export async function requestResidentPhoneCode(db: Db, phone: string, ip: string, deliver = deliverResidentPhoneCode) {
  await limitResidentPhone(db, "send", phone, ip);
  const challenge = crypto.randomUUID();
  const { data: matches, error } = await db.rpc("find_resident_phone_account", { p_phone: phone });
  if (error) throw new Error("Phone sign-in is temporarily unavailable. Please try again later.");
  const match = matches?.length === 1 ? matches[0] : null;
  if (match) {
    const auth = await db.auth.admin.getUserById(match.id);
    // No new identities, phone linking, or staff account changes.
    if (!auth.error && auth.data.user?.email && !auth.data.user.banned_until) {
      const code = randomPhoneCode();
      const created = await db.rpc("create_resident_phone_challenge", { p_id: challenge, p_resident: match.id, p_phone: match.phone, p_hash: await phoneHash(`${challenge}:${code}`) });
      if (created.error) throw new Error("Phone sign-in is temporarily unavailable. Please try again later.");
      const delivered = await deliver(db, match.phone, code, challenge);
      const saved = await db.from("resident_phone_challenges").update({ delivered, ...(!delivered ? { consumed_at: new Date().toISOString() } : {}) }).eq("id", challenge);
      if (saved.error) throw new Error("Phone sign-in is temporarily unavailable. Please try again later.");
    }
  }
  // Identical response for unknown/inactive/ambiguous numbers and delivery failure.
  return { challenge, expiresIn: 300, resendAfter: 60 };
}

export async function verifyResidentPhoneCode(db: Db, challenge: string, code: string, ip: string, establish: (id: string) => Promise<{ access_token: string; refresh_token: string }>) {
  await limitResidentPhone(db, "verify", challenge, ip);
  const consumed = await db.rpc("consume_resident_phone_challenge", { p_id: challenge, p_hash: await phoneHash(`${challenge}:${code}`) });
  if (consumed.error || !consumed.data) throw new Error(PHONE_LOGIN_ERROR);
  return establish(consumed.data);
}

/** Mint an ordinary provider session only AFTER atomic SMS verification. */
export async function establishResidentPhoneSession(db: Db, id: string, url: string, key: string) {
  const [profile, roles, auth] = await Promise.all([
    db.from("users").select("status").eq("id", id).maybeSingle(),
    db.from("user_roles").select("role").eq("user_id", id),
    db.auth.admin.getUserById(id),
  ]);
  if (profile.error || roles.error || auth.error || !residentDecision({ profile: profile.data, roles: (roles.data ?? []).map((r: { role: string }) => r.role) }).ok || !auth.data.user?.email) throw new Error(PHONE_LOGIN_ERROR);
  const link = await db.auth.admin.generateLink({ type: "magiclink", email: auth.data.user.email });
  if (link.error || link.data.user?.id !== id || !link.data.properties?.hashed_token) throw new Error(PHONE_LOGIN_ERROR);
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: (input, init) => { const headers = new Headers(init?.headers); if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization"); headers.set("apikey", key); return fetch(input, { ...init, headers }); } } });
  const verified = await client.auth.verifyOtp({ type: "magiclink", token_hash: link.data.properties.hashed_token });
  if (verified.error || !verified.data.session || verified.data.user?.id !== id) {
    if (verified.data.session) await client.auth.signOut();
    throw new Error(PHONE_LOGIN_ERROR);
  }
  return { access_token: verified.data.session.access_token, refresh_token: verified.data.session.refresh_token };
}