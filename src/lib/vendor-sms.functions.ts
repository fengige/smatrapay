import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Credential fields shared with the global SMS provider records (/configurations/sms). */
export const SMS_FIELDS = [
  { key: "api_url", label: "API URL", secret: false },
  { key: "api_key", label: "API Key", secret: true },
  { key: "api_secret", label: "API Secret", secret: true },
  { key: "username", label: "Username", secret: false },
  { key: "password", label: "Password", secret: true },
  { key: "sender_id", label: "Sender ID", secret: false },
  { key: "account_id", label: "Account ID", secret: false },
  { key: "client_id", label: "Client ID", secret: false },
] as const;
export type SmsFieldKey = (typeof SMS_FIELDS)[number]["key"];
const SECRET_KEYS = SMS_FIELDS.filter((f) => f.secret).map((f) => f.key) as SmsFieldKey[];
const ALL_KEYS = SMS_FIELDS.map((f) => f.key) as SmsFieldKey[];

async function assertAdminAndVendor(context: { supabase: any; userId: string }, vendorId: string) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Admin access required");
  const { data: isVendor } = await context.supabase.rpc("has_role", {
    _user_id: vendorId,
    _role: "vendor",
  });
  if (!isVendor) throw new Error("Vendor not found");
}

async function audit(ctx: any, vendorId: string, action: string, resourceId: string, metadata: any) {
  await ctx.supabase.from("vendor_audit_logs").insert({
    vendor_id: vendorId,
    actor_id: ctx.userId,
    action,
    resource_type: "sms_configuration",
    resource_id: resourceId,
    metadata,
  });
}

export type VendorSmsProvider = {
  id: string;
  provider_name: string;
  provider_code: string;
  global_active: boolean;
  fields: SmsFieldKey[];
  values: Partial<Record<SmsFieldKey, string>>;
  stored_secrets: Partial<Record<SmsFieldKey, boolean>>;
  is_enabled: boolean;
  configured: boolean;
  updated_at: string | null;
};

export const listVendorSmsProviders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ vendorId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdminAndVendor(context as never, data.vendorId);
    const [g, v] = await Promise.all([
      context.supabase.from("sms_configurations").select("*").order("created_at"),
      context.supabase
        .from("vendor_sms_configurations")
        .select("*")
        .eq("vendor_id", data.vendorId),
    ]);
    if (g.error) throw new Error(g.error.message);
    if (v.error) throw new Error(v.error.message);
    const byProvider = new Map((v.data ?? []).map((r: any) => [r.sms_configuration_id, r]));

    const providers: VendorSmsProvider[] = (g.data ?? []).map((p: any) => {
      // Fields a provider uses are those populated on its global definition.
      let fields = ALL_KEYS.filter((k) => p[k] != null && String(p[k]).trim() !== "");
      if (!fields.includes("sender_id")) fields.push("sender_id");
      if (fields.length <= 1) fields = [...ALL_KEYS];
      fields = ALL_KEYS.filter((k) => fields.includes(k));
      const row: any = byProvider.get(p.id);
      const values: Partial<Record<SmsFieldKey, string>> = {};
      const stored: Partial<Record<SmsFieldKey, boolean>> = {};
      for (const k of fields) {
        if (SECRET_KEYS.includes(k)) {
          stored[k] = Boolean(row?.[k]);
          values[k] = "";
        } else values[k] = row?.[k] ?? "";
      }
      const configured =
        !!row && fields.every((k) => (SECRET_KEYS.includes(k) ? !!row[k] : !!row[k]));
      return {
        id: p.id,
        provider_name: p.provider_name,
        provider_code: p.provider_code,
        global_active: Boolean(p.is_active),
        fields,
        values,
        stored_secrets: stored,
        is_enabled: Boolean(row?.is_enabled),
        configured,
        updated_at: row?.updated_at ?? null,
      };
    });
    return { providers };
  });

const saveInput = z.object({
  vendorId: z.string().uuid(),
  providerId: z.string().uuid(),
  values: z.record(z.string(), z.string().trim().max(500)),
  removeSecrets: z.array(z.string()).optional().default([]),
});

export const saveVendorSmsProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => saveInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdminAndVendor(context as never, data.vendorId);
    const { supabase, userId } = context;
    const { data: provider } = await supabase
      .from("sms_configurations")
      .select("id")
      .eq("id", data.providerId)
      .maybeSingle();
    if (!provider) throw new Error("SMS provider not found");

    const { data: existing } = await supabase
      .from("vendor_sms_configurations")
      .select("*")
      .eq("vendor_id", data.vendorId)
      .eq("sms_configuration_id", data.providerId)
      .maybeSingle();

    const patch: Record<string, string | null> = {};
    for (const [k, raw] of Object.entries(data.values)) {
      if (!ALL_KEYS.includes(k as SmsFieldKey)) throw new Error(`Unknown field: ${k}`);
      const val = raw.trim();
      if (SECRET_KEYS.includes(k as SmsFieldKey)) {
        if (val) patch[k] = val;
        else if (data.removeSecrets.includes(k)) patch[k] = null;
      } else patch[k] = val || null;
    }
    if (patch["api_url"]) {
      try {
        const u = new URL(patch["api_url"]);
        if (!/^https?:$/.test(u.protocol)) throw new Error();
      } catch {
        throw new Error("API URL must be a valid http(s) URL");
      }
    }
    if (patch["sender_id"] && patch["sender_id"].length > 11 && !/^\+?\d+$/.test(patch["sender_id"])) {
      throw new Error("Sender ID must be 11 characters or fewer");
    }

    let id: string;
    if (existing) {
      const { error } = await supabase
        .from("vendor_sms_configurations")
        .update({ ...patch, updated_by: userId })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
      id = existing.id;
    } else {
      const { data: ins, error } = await supabase
        .from("vendor_sms_configurations")
        .insert({
          ...patch,
          vendor_id: data.vendorId,
          sms_configuration_id: data.providerId,
          created_by: userId,
          updated_by: userId,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      id = ins.id;
    }
    await audit(context, data.vendorId, "VENDOR_SMS_CONFIGURATION_SAVED", id, {
      provider_id: data.providerId,
      fields: Object.keys(patch),
    });
    return { id };
  });

export const setVendorSmsProviderEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ vendorId: z.string().uuid(), providerId: z.string().uuid(), enabled: z.boolean() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdminAndVendor(context as never, data.vendorId);
    const { supabase, userId } = context;
    const [{ data: provider }, { data: row }] = await Promise.all([
      supabase.from("sms_configurations").select("*").eq("id", data.providerId).maybeSingle(),
      supabase
        .from("vendor_sms_configurations")
        .select("*")
        .eq("vendor_id", data.vendorId)
        .eq("sms_configuration_id", data.providerId)
        .maybeSingle(),
    ]);
    if (!provider) throw new Error("SMS provider not found");

    if (!data.enabled) {
      if (!row) return { ok: true };
      const { error } = await supabase
        .from("vendor_sms_configurations")
        .update({ is_enabled: false, updated_by: userId })
        .eq("id", row.id);
      if (error) throw new Error(error.message);
      await audit(context, data.vendorId, "VENDOR_SMS_PROVIDER_DISABLED", row.id, {
        provider_id: data.providerId,
      });
      return { ok: true };
    }

    if (!row) throw new Error("Save this provider's configuration before enabling it");
    const p: any = provider;
    let fields = ALL_KEYS.filter((k) => p[k] != null && String(p[k]).trim() !== "");
    if (!fields.includes("sender_id")) fields.push("sender_id");
    if (fields.length <= 1) fields = [...ALL_KEYS];
    const missing = SMS_FIELDS.filter((f) => fields.includes(f.key) && !(row as any)[f.key]).map(
      (f) => f.label,
    );
    if (missing.length) throw new Error(`Complete required fields first: ${missing.join(", ")}`);

    // One active SMS gateway per vendor, mirroring the single default provider globally.
    const off = await supabase
      .from("vendor_sms_configurations")
      .update({ is_enabled: false, updated_by: userId })
      .eq("vendor_id", data.vendorId)
      .neq("id", row.id)
      .eq("is_enabled", true);
    if (off.error) throw new Error(off.error.message);
    const { error } = await supabase
      .from("vendor_sms_configurations")
      .update({ is_enabled: true, updated_by: userId })
      .eq("id", row.id);
    if (error) throw new Error(error.message);
    await audit(context, data.vendorId, "VENDOR_SMS_PROVIDER_ENABLED", row.id, {
      provider_id: data.providerId,
    });
    return { ok: true };
  });
