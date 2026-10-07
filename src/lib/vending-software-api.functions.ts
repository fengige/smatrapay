import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Admin access required");
}

const urlField = z
  .string()
  .trim()
  .max(500)
  .refine((value) => !value || /^https?:\/\/[^\s]+$/i.test(value), {
    message: "Enter a valid URL starting with http:// or https://",
  });

const settingsInput = z.object({
  vending_software_id: uuid,
  API_POS_PURCHASE: urlField.refine(Boolean, { message: "API POS Purchase is required" }),
  API_LOGIN: urlField,
  API_MAINTENANCE_CLEAR_TAMPER: urlField,
  API_MAINTENANCE_CLEAR_CREDIT: urlField,
  API_MAINTENANCE_SET_OVERDRAFT_LIMIT: urlField,
  API_COMPANY_NAME: z.string().trim().max(150).optional(),
  API_USER_NAME: z.string().trim().max(150).optional(),
  API_PASSWORD: z.string().max(200).nullable().optional(),
  clear_password: z.boolean().optional().default(false),
  API_VEND_PASSWORD: z.string().max(200).nullable().optional(),
  clear_vend_password: z.boolean().optional().default(false),
  API_TAAS_ID: z.string().trim().max(150).nullable().optional(),
  API_TAAS_PASSWORD: z.string().max(200).nullable().optional(),
  clear_taas_password: z.boolean().optional().default(false),
});

/** Icon-Token platforms authenticate with a TaaS ID/password instead of company/user. */
function isIconSoftware(s: { name?: string | null; code?: string | null }) {
  const v = `${s.code ?? ""} ${s.name ?? ""}`.toUpperCase();
  return /\bICON(-TOKEN|TOKEN)?\b/.test(v);
}

export type VendingSoftwareApiSettings = {
  API_POS_PURCHASE: string;
  API_LOGIN: string;
  API_MAINTENANCE_CLEAR_TAMPER: string;
  API_MAINTENANCE_CLEAR_CREDIT: string;
  API_MAINTENANCE_SET_OVERDRAFT_LIMIT: string;
  API_COMPANY_NAME: string;
  API_USER_NAME: string;
  has_company_name: boolean;
  has_user_name: boolean;
  has_password: boolean;
  has_vend_password: boolean;
  is_icon: boolean;
  has_taas_id: boolean;
  has_taas_password: boolean;
  updated_at: string | null;
};

const emptySettings = (): VendingSoftwareApiSettings => ({
  API_POS_PURCHASE: "",
  API_LOGIN: "",
  API_MAINTENANCE_CLEAR_TAMPER: "",
  API_MAINTENANCE_CLEAR_CREDIT: "",
  API_MAINTENANCE_SET_OVERDRAFT_LIMIT: "",
  API_COMPANY_NAME: "",
  API_USER_NAME: "",
  has_company_name: false,
  has_user_name: false,
  has_password: false,
  has_vend_password: false,
  is_icon: false,
  has_taas_id: false,
  has_taas_password: false,
  updated_at: null,
});

async function assertSoftwareExists(supabase: any, id: string) {
  const { data, error } = await supabase
    .from("vending_software")
    .select("vending_software_id, name, code")
    .eq("vending_software_id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Vending software not found");
  return data as { vending_software_id: string; name: string; code: string | null };
}

export const getVendingSoftwareApiSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const supabase = context.supabase as any;
    const sw = await assertSoftwareExists(supabase, data.id);
    const isIcon = isIconSoftware(sw);

    const { data: row, error } = await supabase
      .from("vending_software_api_settings")
      .select(
        "api_pos_purchase, api_login, api_maintenance_clear_tamper, api_maintenance_clear_credit, api_maintenance_set_overdraft_limit, api_company_name, api_user_name, api_password, api_vend_password, api_taas_id, api_taas_password, updated_at",
      )
      .eq("vending_software_id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { settings: { ...emptySettings(), is_icon: isIcon }, configured: false };

    return {
      configured: true,
      settings: {
        API_POS_PURCHASE: row.api_pos_purchase ?? "",
        API_LOGIN: row.api_login ?? "",
        API_MAINTENANCE_CLEAR_TAMPER: row.api_maintenance_clear_tamper ?? "",
        API_MAINTENANCE_CLEAR_CREDIT: row.api_maintenance_clear_credit ?? "",
        API_MAINTENANCE_SET_OVERDRAFT_LIMIT: row.api_maintenance_set_overdraft_limit ?? "",
        API_COMPANY_NAME: "",
        API_USER_NAME: "",
        has_company_name: Boolean(row.api_company_name),
        has_user_name: Boolean(row.api_user_name),
        has_password: Boolean(row.api_password),
        has_vend_password: Boolean(row.api_vend_password),
        is_icon: isIcon,
        has_taas_id: Boolean(row.api_taas_id),
        has_taas_password: Boolean(row.api_taas_password),
        updated_at: row.updated_at ?? null,
      } satisfies VendingSoftwareApiSettings,
    };
  });

export const saveVendingSoftwareApiSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => settingsInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const supabase = context.supabase as any;
    const software = await assertSoftwareExists(supabase, data.vending_software_id);
    const isIcon = isIconSoftware(software);

    const urls = [
      data.API_POS_PURCHASE,
      data.API_LOGIN,
      data.API_MAINTENANCE_CLEAR_TAMPER,
      data.API_MAINTENANCE_CLEAR_CREDIT,
      data.API_MAINTENANCE_SET_OVERDRAFT_LIMIT,
    ].filter(Boolean);
    if (new Set(urls).size !== urls.length) throw new Error("Each API endpoint must be a different URL");

    const { data: existing, error: readError } = await supabase
      .from("vending_software_api_settings")
      .select("id, api_company_name, api_user_name, api_password, api_vend_password, api_taas_id, api_taas_password")
      .eq("vending_software_id", data.vending_software_id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);

    const storedPassword = existing?.api_password ?? null;
    const nextPassword = data.clear_password
      ? null
      : data.API_PASSWORD?.length
        ? data.API_PASSWORD
        : storedPassword;
    const nextVend = data.clear_vend_password
      ? null
      : data.API_VEND_PASSWORD?.length
        ? data.API_VEND_PASSWORD
        : (existing?.api_vend_password ?? null);
    const nextTaasId = data.API_TAAS_ID?.trim() || existing?.api_taas_id || null;
    const nextTaasPassword = data.clear_taas_password
      ? null
      : data.API_TAAS_PASSWORD?.length
        ? data.API_TAAS_PASSWORD
        : (existing?.api_taas_password ?? null);
    if (isIcon) {
      if (!nextTaasId) throw new Error("API TaaS ID is required");
      if (!nextTaasPassword) throw new Error("API TaaS Password is required");
    } else {
      if (!existing && !nextPassword) throw new Error("API Password is required");
      if (!(data.API_COMPANY_NAME || existing?.api_company_name)) throw new Error("API Company Name is required");
      if (!(data.API_USER_NAME || existing?.api_user_name)) throw new Error("API User Name is required");
    }

    const values = {
      vending_software_id: data.vending_software_id,
      api_pos_purchase: data.API_POS_PURCHASE,
      api_login: data.API_LOGIN || null,
      api_maintenance_clear_tamper: data.API_MAINTENANCE_CLEAR_TAMPER || null,
      api_maintenance_clear_credit: data.API_MAINTENANCE_CLEAR_CREDIT || null,
      api_maintenance_set_overdraft_limit: data.API_MAINTENANCE_SET_OVERDRAFT_LIMIT || null,
      api_company_name: data.API_COMPANY_NAME || existing?.api_company_name || null,
      api_user_name: data.API_USER_NAME || existing?.api_user_name || null,
      api_password: nextPassword,
      api_vend_password: nextVend,
      api_taas_id: nextTaasId,
      api_taas_password: nextTaasPassword,
    };

    const result = existing
      ? await supabase.from("vending_software_api_settings").update(values).eq("id", existing.id)
      : await supabase.from("vending_software_api_settings").insert(values);
    if (result.error) throw new Error(result.error.message);

    await supabase.from("vending_software_audit_logs").insert({
      vending_software_id: data.vending_software_id,
      software_name: software.name,
      actor_id: context.userId,
      action: existing ? "api_settings_updated" : "api_settings_created",
      changes: {
        fields: [
          "API_POS_PURCHASE",
          "API_LOGIN",
          "API_MAINTENANCE_CLEAR_TAMPER",
          "API_MAINTENANCE_CLEAR_CREDIT",
          "API_MAINTENANCE_SET_OVERDRAFT_LIMIT",
          ...(data.API_COMPANY_NAME ? ["API_COMPANY_NAME"] : []),
          ...(data.API_USER_NAME ? ["API_USER_NAME"] : []),
          ...(data.API_PASSWORD || data.clear_password ? ["API_PASSWORD"] : []),
          ...(data.API_VEND_PASSWORD || data.clear_vend_password ? ["API_VEND_PASSWORD"] : []),
          ...(data.API_TAAS_ID ? ["API_TAAS_ID"] : []),
          ...(data.API_TAAS_PASSWORD || data.clear_taas_password ? ["API_TAAS_PASSWORD"] : []),
        ],
      },
    });

    return { ok: true, has_password: Boolean(nextPassword) };
  });

export const testVendingSoftwareApiConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const supabase = context.supabase as any;
    const sw = await assertSoftwareExists(supabase, data.id);

    const { data: row, error } = await supabase
      .from("vending_software_api_settings")
      .select("api_login, api_company_name, api_user_name, api_password, api_pos_purchase, api_taas_id, api_taas_password")
      .eq("vending_software_id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (isIconSoftware(sw)) {
      if (!row?.api_pos_purchase || !row.api_taas_id || !row.api_taas_password)
        return { status: "invalid" as const, message: "Save the API POS Purchase endpoint, TaaS ID and TaaS Password before testing." };
      // Non-billing probe: an unregistered DRN is always rejected, but Icon checks
      // the TaaS credentials first, so AUTH FAILED vs Rejected tells us which is wrong.
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12_000);
        const res = await fetch(row.api_pos_purchase, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ drn: "00000000000", units: "0.1", unitsAmount: "10", taasid: row.api_taas_id, taaspasswd: row.api_taas_password }),
          signal: controller.signal,
        });
        clearTimeout(timer);
        const body: any = await res.json().catch(() => null);
        const code = body?.ResultCode != null ? String(body.ResultCode) : null;
        if (code === "IT00010" || /AUTH/i.test(String(body?.ResultDesc ?? "")))
          return { status: "auth_failed" as const, message: "Authentication failed. Check the TaaS ID and TaaS Password." };
        if (res.ok && code) return { status: "ok" as const, message: "Connection successful — Icon-Token accepted the TaaS credentials (no token was generated)." };
        return { status: "unreachable" as const, message: "Icon-Token returned an unexpected response to the connection test." };
      } catch {
        return { status: "unreachable" as const, message: "Unable to contact Icon-Token." };
      }
    }
    if (!row?.api_login || !row.api_company_name || !row.api_user_name || !row.api_password) {
      return {
        status: "invalid" as const,
        message: "Save a login endpoint and complete account credentials before testing.",
      };
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12_000);
      const response = await fetch(row.api_login, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          company: row.api_company_name,
          username: row.api_user_name,
          password: row.api_password,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (response.status === 401 || response.status === 403) {
        return { status: "auth_failed" as const, message: "Authentication failed. Check the saved credentials." };
      }
      if (!response.ok) {
        return { status: "unreachable" as const, message: "The login endpoint could not complete the connection test." };
      }
      return { status: "ok" as const, message: "Connection successful" };
    } catch {
      return { status: "unreachable" as const, message: "The login endpoint could not be reached." };
    }
  });