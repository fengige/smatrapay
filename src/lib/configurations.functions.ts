import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Admin access required");
}

/** Keys allowed in the key/value app_settings store, grouped per configuration tab. */
export const SETTING_GROUPS = {
  app: [
    "app_name",
    "app_support_email",
    "app_support_phone",
    "footer_copyright",
    "footer_terms_url",
    "footer_privacy_url",
  ],
  mail: [
    "mail_driver",
    "mail_host",
    "mail_port",
    "mail_username",
    "mail_password",
    "mail_encryption",
    "mail_from_address",
    "mail_from_name",
    "mail_enabled",
  ],
  map: ["google_maps_api_key", "google_maps_enabled", "google_maps_default_center"],
  social: [
    "social_google_enabled",
    "social_google_client_id",
    "social_google_client_secret",
    "social_google_redirect_url",
    "social_apple_enabled",
    "social_apple_client_id",
    "social_apple_client_secret",
    "social_apple_redirect_url",
    "social_microsoft_enabled",
    "social_microsoft_client_id",
    "social_microsoft_client_secret",
    "social_microsoft_redirect_url",
  ],
  currency: [
    "currency_name",
    "currency_code",
    "currency_symbol",
    "currency_decimals",
    "currency_status",
    "currency_is_default",
  ],
} as const;

export type SettingGroup = keyof typeof SETTING_GROUPS;

const ALL_KEYS: string[] = Object.values(SETTING_GROUPS).flatMap((keys) => [...keys]);

export const SETTING_DEFAULTS: Record<string, string> = {
  app_name: "SmatraPay",
  app_support_email: "",
  app_support_phone: "",
  footer_copyright: "Developed by Rezicom Technologies Limited. All rights reserved.",
  footer_terms_url: "/terms",
  footer_privacy_url: "/privacy",
  mail_driver: "smtp",
  mail_host: "",
  mail_port: "587",
  mail_username: "",
  mail_password: "",
  mail_encryption: "tls",
  mail_from_address: "",
  mail_from_name: "SmatraPay",
  mail_enabled: "false",
  google_maps_api_key: "",
  google_maps_enabled: "false",
  google_maps_default_center: "-1.286389,36.817223",
  social_google_enabled: "false",
  social_google_client_id: "",
  social_google_client_secret: "",
  social_google_redirect_url: "",
  social_apple_enabled: "false",
  social_apple_client_id: "",
  social_apple_client_secret: "",
  social_apple_redirect_url: "",
  social_microsoft_enabled: "false",
  social_microsoft_client_id: "",
  social_microsoft_client_secret: "",
  social_microsoft_redirect_url: "",
  currency_name: "Kenyan Shilling",
  currency_code: "KES",
  currency_symbol: "KSh",
  currency_decimals: "2",
  currency_status: "true",
  currency_is_default: "true",
};

const groupInput = z.object({
  group: z.enum(["app", "mail", "map", "social", "currency"]),
});

const saveInput = z.object({
  group: z.enum(["app", "mail", "map", "social", "currency"]),
  values: z.record(z.string().max(120), z.string().max(1000)),
});

/** Read a settings group (admin only, values include credentials). */
export const getConfiguration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => groupInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const keys = [...SETTING_GROUPS[data.group as SettingGroup]];
    const { data: rows, error } = await context.supabase
      .from("app_settings")
      .select("key, value")
      .in("key", keys);
    if (error) throw new Error(error.message);

    const map = new Map((rows ?? []).map((r: any) => [r.key as string, r.value as string]));
    const values: Record<string, string> = {};
    for (const key of keys) values[key] = map.get(key) ?? SETTING_DEFAULTS[key] ?? "";
    return { values };
  });

/** Persist a settings group. Unknown keys are rejected. */
export const saveConfiguration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => saveInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const allowed = new Set<string>(SETTING_GROUPS[data.group as SettingGroup]);
    const entries = Object.entries(data.values);
    for (const [key] of entries) {
      if (!allowed.has(key) || !ALL_KEYS.includes(key)) {
        throw new Error(`Unknown setting: ${key}`);
      }
    }

    const rows = entries.map(([key, value]) => ({
      key,
      value,
      updated_at: new Date().toISOString(),
      updated_by: context.userId,
    }));

    const { error } = await context.supabase
      .from("app_settings")
      .upsert(rows, { onConflict: "key" });
    if (error) throw new Error(error.message);
    return { saved: rows.length };
  });

/* ---------------------------------- SMS ---------------------------------- */

export type SmsConfigRow = {
  id: string;
  provider_name: string;
  provider_code: string;
  api_url: string | null;
  api_key: string | null;
  api_secret: string | null;
  username: string | null;
  password: string | null;
  sender_id: string | null;
  account_id: string | null;
  client_id: string | null;
  is_active: boolean;
  is_default: boolean;
  status: string;
  created_at: string;
  updated_at: string;
};

const smsInput = z.object({
  id: z.string().uuid().optional(),
  provider_name: z.string().trim().min(2, "Provider name is required").max(100),
  provider_code: z.string().trim().min(2, "Provider code is required").max(50),
  api_url: z.string().trim().max(500).optional().default(""),
  api_key: z.string().trim().max(500).optional().default(""),
  api_secret: z.string().trim().max(500).optional().default(""),
  username: z.string().trim().max(150).optional().default(""),
  password: z.string().trim().max(500).optional().default(""),
  sender_id: z.string().trim().max(50).optional().default(""),
  account_id: z.string().trim().max(150).optional().default(""),
  client_id: z.string().trim().max(150).optional().default(""),
  is_active: z.boolean().optional().default(false),
  is_default: z.boolean().optional().default(false),
});

export const listSmsConfigurations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { data, error } = await context.supabase
      .from("sms_configurations")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { configurations: (data ?? []) as SmsConfigRow[] };
  });

export const saveSmsConfiguration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => smsInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabase } = context;

    const payload = {
      provider_name: data.provider_name,
      provider_code: data.provider_code.toLowerCase(),
      api_url: data.api_url || null,
      api_key: data.api_key || null,
      api_secret: data.api_secret || null,
      username: data.username || null,
      password: data.password || null,
      sender_id: data.sender_id || null,
      account_id: data.account_id || null,
      client_id: data.client_id || null,
      is_active: data.is_active,
      is_default: data.is_default,
      status: data.is_active ? "active" : "inactive",
      updated_at: new Date().toISOString(),
    };

    const existing = await supabase
      .from("sms_configurations")
      .select("id")
      .ilike("provider_code", payload.provider_code)
      .maybeSingle();
    if (existing.data && existing.data.id !== data.id) {
      throw new Error("A provider with this code already exists");
    }

    let id = data.id;
    if (id) {
      const { error } = await supabase.from("sms_configurations").update(payload).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { data: inserted, error } = await supabase
        .from("sms_configurations")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      id = inserted.id as string;
    }

    if (data.is_default && id) {
      const { error } = await supabase
        .from("sms_configurations")
        .update({ is_default: false })
        .neq("id", id);
      if (error) throw new Error(error.message);
    }

    return { id };
  });

const statusInput = z.object({ id: z.string().uuid(), is_active: z.boolean() });

export const setSmsConfigurationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => statusInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { error } = await context.supabase
      .from("sms_configurations")
      .update({
        is_active: data.is_active,
        status: data.is_active ? "active" : "inactive",
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSmsConfiguration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { error } = await context.supabase
      .from("sms_configurations")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
