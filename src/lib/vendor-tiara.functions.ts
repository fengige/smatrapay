import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const TIARA_DEFAULT_ENDPOINT = "https://api2.tiaraconnect.io/api/messaging/sendsms";
const TIARA_CODE = "tiara";

type Ctx = { supabase: any; userId: string };

async function assertAdminAndVendor(ctx: Ctx, vendorId: string) {
  const { data: isAdmin } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!isAdmin) throw new Error("Admin access required");
  const { data, error } = await ctx.supabase.from("users").select("id").eq("id", vendorId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Vendor not found");
}

async function getProvider(ctx: Ctx) {
  const { data, error } = await ctx.supabase
    .from("sms_configurations")
    .select("id, provider_name, is_active")
    .eq("provider_code", TIARA_CODE)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("TIARA CONNECT is not set up under Configurations → SMS Configuration");
  return data as { id: string; provider_name: string; is_active: boolean };
}

async function getRow(ctx: Ctx, vendorId: string, providerId: string) {
  const { data, error } = await ctx.supabase
    .from("vendor_sms_configurations")
    .select("*")
    .eq("vendor_id", vendorId)
    .eq("sms_configuration_id", providerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as any;
}

async function audit(ctx: Ctx, vendorId: string, action: string, resourceId: string, metadata: any) {
  await ctx.supabase.from("vendor_audit_logs").insert({
    vendor_id: vendorId,
    actor_id: ctx.userId,
    action,
    resource_type: "sms_configuration",
    resource_id: resourceId,
    metadata,
  });
}

function isHttpsUrl(v: string) {
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export function normalizePhone(raw: string, cc: string) {
  let p = raw.replace(/[\s\-()]/g, "");
  if (p.startsWith("+")) p = p.slice(1);
  else if (p.startsWith("00")) p = p.slice(2);
  else if (p.startsWith("0")) p = cc + p.slice(1);
  else if (!p.startsWith(cc) && p.length <= 9) p = cc + p;
  if (!/^\d{9,15}$/.test(p)) throw new Error("Enter a valid mobile number");
  return p;
}

export type TiaraConfig = {
  providerId: string;
  providerName: string;
  providerActive: boolean;
  configured: boolean;
  enabled: boolean;
  api_url: string;
  has_api_key: boolean;
  sender_id: string;
  message_type: 1 | 2;
  default_country_code: string;
  delivery_receipt_callback_url: string;
  updated_at: string | null;
};

export const getVendorTiaraConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ vendorId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<TiaraConfig> => {
    const ctx = context as unknown as Ctx;
    await assertAdminAndVendor(ctx, data.vendorId);
    const p = await getProvider(ctx);
    const r = await getRow(ctx, data.vendorId, p.id);
    return {
      providerId: p.id,
      providerName: p.provider_name,
      providerActive: Boolean(p.is_active),
      configured: !!r,
      enabled: Boolean(r?.is_enabled),
      api_url: r?.api_url || TIARA_DEFAULT_ENDPOINT,
      has_api_key: Boolean(r?.api_key),
      sender_id: r?.sender_id ?? "",
      message_type: r?.message_type === 2 ? 2 : 1,
      default_country_code: r?.default_country_code ?? "254",
      delivery_receipt_callback_url: r?.delivery_receipt_callback_url ?? "",
      updated_at: r?.updated_at ?? null,
    };
  });

const saveInput = z.object({
  vendorId: z.string().uuid(),
  api_url: z.string().trim().max(500),
  api_key: z.string().trim().max(1000).optional().default(""),
  remove_api_key: z.boolean().optional().default(false),
  sender_id: z.string().trim().min(1, "Sender ID is required").max(11, "Sender ID must be 11 characters or fewer"),
  message_type: z.union([z.literal(1), z.literal(2)]),
  default_country_code: z.string().trim().regex(/^\d{1,4}$/, "Country code must be 1–4 digits"),
  delivery_receipt_callback_url: z.string().trim().max(500).optional().default(""),
});

export const saveVendorTiaraConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => saveInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertAdminAndVendor(ctx, data.vendorId);
    if (!isHttpsUrl(data.api_url)) throw new Error("SMS API Endpoint must be a valid URL");
    if (data.delivery_receipt_callback_url && !data.delivery_receipt_callback_url.startsWith("https://"))
      throw new Error("Delivery receipt callback URL must be a public https:// URL");
    const p = await getProvider(ctx);
    const existing = await getRow(ctx, data.vendorId, p.id);
    const patch: Record<string, unknown> = {
      api_url: data.api_url,
      sender_id: data.sender_id,
      message_type: data.message_type,
      default_country_code: data.default_country_code,
      delivery_receipt_callback_url: data.delivery_receipt_callback_url || null,
      updated_by: ctx.userId,
    };
    if (data.api_key) patch["api_key"] = data.api_key;
    else if (data.remove_api_key) patch["api_key"] = null;
    if (patch["api_key"] === null && existing?.is_enabled) patch["is_enabled"] = false;

    let id: string;
    if (existing) {
      const { error } = await ctx.supabase.from("vendor_sms_configurations").update(patch).eq("id", existing.id);
      if (error) throw new Error(error.message);
      id = existing.id;
    } else {
      const { data: ins, error } = await ctx.supabase
        .from("vendor_sms_configurations")
        .insert({ ...patch, vendor_id: data.vendorId, sms_configuration_id: p.id, created_by: ctx.userId })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      id = ins.id;
    }
    await audit(ctx, data.vendorId, "VENDOR_SMS_CONFIGURATION_SAVED", id, {
      provider: "tiara",
      api_key_changed: Boolean(data.api_key) || data.remove_api_key,
    });
    return { id };
  });

export const setVendorTiaraEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ vendorId: z.string().uuid(), enabled: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertAdminAndVendor(ctx, data.vendorId);
    const p = await getProvider(ctx);
    const r = await getRow(ctx, data.vendorId, p.id);
    if (!r) throw new Error("Save the SMS configuration before enabling it");
    if (data.enabled) {
      if (!p.is_active) throw new Error("TIARA CONNECT is inactive globally. Activate it under Configurations → SMS Configuration.");
      if (!r.api_key || !r.sender_id || !r.api_url) throw new Error("API Key, Sender ID and endpoint must be saved first");
      const off = await ctx.supabase
        .from("vendor_sms_configurations")
        .update({ is_enabled: false, updated_by: ctx.userId })
        .eq("vendor_id", data.vendorId)
        .neq("id", r.id)
        .eq("is_enabled", true);
      if (off.error) throw new Error(off.error.message);
    }
    const { error } = await ctx.supabase
      .from("vendor_sms_configurations")
      .update({ is_enabled: data.enabled, updated_by: ctx.userId })
      .eq("id", r.id);
    if (error) throw new Error(error.message);
    await audit(ctx, data.vendorId, data.enabled ? "VENDOR_SMS_PROVIDER_ENABLED" : "VENDOR_SMS_PROVIDER_DISABLED", r.id, { provider: "tiara" });
    return { ok: true };
  });

type TiaraResp = { status?: string; statusCode?: string | number; desc?: string; msgId?: string; cost?: string | number; balance?: string | number };

async function callTiara(endpoint: string, apiKey: string, body: Record<string, unknown>) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json: TiaraResp | null = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { http: res.status, json, text: text.slice(0, 300) };
  } finally {
    clearTimeout(t);
  }
}

function looksLikeAuthFailure(http: number, json: TiaraResp | null) {
  if (http === 401 || http === 403) return true;
  const d = `${json?.desc ?? ""} ${json?.status ?? ""}`.toLowerCase();
  return /unauthori|forbidden|invalid (api )?key|invalid token|authentication/.test(d);
}

export type ConnectionResult = { ok: boolean; kind: "verified" | "auth" | "endpoint" | "network" | "provider"; message: string };

export const testVendorTiaraConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ vendorId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<ConnectionResult> => {
    const ctx = context as unknown as Ctx;
    await assertAdminAndVendor(ctx, data.vendorId);
    const p = await getProvider(ctx);
    const r = await getRow(ctx, data.vendorId, p.id);
    if (!r?.api_url || !isHttpsUrl(r.api_url)) return { ok: false, kind: "endpoint", message: "Save a valid SMS API Endpoint first." };
    if (!r.api_key) return { ok: false, kind: "auth", message: "No API key is saved for this vendor." };
    if (!r.sender_id) return { ok: false, kind: "provider", message: "Save a Sender ID first." };
    // TIARA CONNECT has no documented connection-test endpoint. Probe the send endpoint with
    // no recipient so no SMS can be delivered or billed; we only learn whether the key is rejected.
    let out;
    try {
      out = await callTiara(r.api_url, r.api_key, { from: r.sender_id, to: "", message: "", refId: `probe-${crypto.randomUUID()}` });
    } catch (e) {
      const aborted = (e as Error).name === "AbortError";
      return { ok: false, kind: "network", message: aborted ? "The provider did not respond within 15 seconds." : "Could not reach the SMS API Endpoint. Check the URL and network." };
    }
    if (out.http === 404 || out.http === 405) return { ok: false, kind: "endpoint", message: `The endpoint answered ${out.http}. Check the SMS API Endpoint URL.` };
    if (looksLikeAuthFailure(out.http, out.json)) return { ok: false, kind: "auth", message: "TIARA CONNECT rejected the API key. Re-enter the API key." };
    if (out.http >= 500) return { ok: false, kind: "provider", message: `TIARA CONNECT returned a server error (${out.http}). Try again later.` };
    return {
      ok: true,
      kind: "verified",
      message: `Endpoint reachable and the API key was not rejected (no SMS sent). Provider said: ${out.json?.desc ?? `HTTP ${out.http}`}. Send a test SMS to fully confirm delivery.`,
    };
  });

export type TestSmsResult = {
  submitted: boolean;
  status: string | null;
  statusCode: string | null;
  desc: string | null;
  msgId: string | null;
  cost: string | null;
  balance: string | null;
  recipient: string;
};

export const sendVendorTiaraTestSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        vendorId: z.string().uuid(),
        recipient: z.string().trim().min(6).max(20),
        message: z.string().trim().min(1, "Message is required").max(480),
        idempotencyKey: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<TestSmsResult> => {
    const ctx = context as unknown as Ctx;
    await assertAdminAndVendor(ctx, data.vendorId);
    const p = await getProvider(ctx);
    const r = await getRow(ctx, data.vendorId, p.id);
    if (!r) throw new Error("Save the SMS configuration first");
    if (!r.is_enabled) throw new Error("SMS service is disabled for this vendor. Enable it to send messages.");
    if (!r.api_key || !r.sender_id || !r.api_url) throw new Error("API Key, Sender ID and endpoint must be saved first");

    // Abuse protection: max 5 test messages per vendor per 10 minutes.
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count } = await ctx.supabase
      .from("sms_messages")
      .select("id", { count: "exact", head: true })
      .eq("vendor_id", data.vendorId)
      .gte("created_at", since);
    if ((count ?? 0) >= 5) throw new Error("Too many test messages. Please wait a few minutes and try again.");

    const refId = `sp-${data.idempotencyKey}`;
    const { data: dup } = await ctx.supabase.from("sms_messages").select("id").eq("ref_id", refId).maybeSingle();
    if (dup) throw new Error("This test message was already sent.");

    const to = normalizePhone(data.recipient, r.default_country_code || "254");
    const { data: log, error: logErr } = await ctx.supabase
      .from("sms_messages")
      .insert({
        configuration_id: p.id,
        vendor_id: data.vendorId,
        recipient_phone: to,
        message: "[test message]",
        sender_id: r.sender_id,
        ref_id: refId,
        message_type: r.message_type ?? 1,
        status: "pending",
        created_by: ctx.userId,
      })
      .select("id")
      .single();
    if (logErr) throw new Error(logErr.message);

    const body: Record<string, unknown> = { from: r.sender_id, to, message: data.message, refId };
    if (r.message_type === 2) body["messageType"] = "2";
    let out;
    try {
      out = await callTiara(r.api_url, r.api_key, body);
    } catch (e) {
      const msg = (e as Error).name === "AbortError" ? "Provider timed out" : "Could not reach provider";
      await ctx.supabase.from("sms_messages").update({ status: "failed", error_message: msg }).eq("id", log.id);
      throw new Error(msg);
    }
    const j = out.json ?? {};
    const submitted = String(j.status ?? "").toUpperCase() === "SUCCESS" && String(j.statusCode ?? "") === "0";
    const errMsg = submitted
      ? null
      : looksLikeAuthFailure(out.http, out.json)
        ? "API key rejected"
        : (j.desc ?? `HTTP ${out.http}`).toString().slice(0, 300);
    await ctx.supabase
      .from("sms_messages")
      .update({
        status: submitted ? "submitted" : "failed",
        provider_message_id: j.msgId ?? null,
        cost: j.cost != null ? String(j.cost) : null,
        error_message: errMsg,
        sent_at: submitted ? new Date().toISOString() : null,
      })
      .eq("id", log.id);
    await audit(ctx, data.vendorId, "VENDOR_SMS_TEST_SENT", log.id, { provider: "tiara", submitted, msg_id: j.msgId ?? null });
    return {
      submitted,
      status: j.status ?? null,
      statusCode: j.statusCode != null ? String(j.statusCode) : null,
      desc: errMsg ?? j.desc ?? null,
      msgId: j.msgId ?? null,
      cost: j.cost != null ? String(j.cost) : null,
      balance: j.balance != null ? String(j.balance) : null,
      recipient: to,
    };
  });
