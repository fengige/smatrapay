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
  API_COMPANY_NAME: z.string().trim().min(1, "API Company Name is required").max(150),
  API_USER_NAME: z.string().trim().min(1, "API User Name is required").max(150),
  API_PASSWORD: z.string().max(200).nullable().optional(),
  clear_password: z.boolean().optional().default(false),
});

export type VendingSoftwareApiSettings = {
  API_POS_PURCHASE: string;
  API_LOGIN: string;
  API_MAINTENANCE_CLEAR_TAMPER: string;
  API_MAINTENANCE_CLEAR_CREDIT: string;
  API_MAINTENANCE_SET_OVERDRAFT_LIMIT: string;
  API_COMPANY_NAME: string;
  API_USER_NAME: string;
  has_password: boolean;
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
  has_password: false,
  updated_at: null,
});

async function assertSoftwareExists(supabase: any, id: string) {
  const { data, error } = await supabase
    .from("vending_software")
    .select("vending_software_id, name")
    .eq("vending_software_id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Vending software not found");
  return data as { vending_software_id: string; name: string };
}

export const getVendingSoftwareApiSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const supabase = context.supabase as any;
    await assertSoftwareExists(supabase, data.id);

    const { data: row, error } = await supabase
      .from("vending_software_api_settings")
      .select(
        "api_pos_purchase, api_login, api_maintenance_clear_tamper, api_maintenance_clear_credit, api_maintenance_set_overdraft_limit, api_company_name, api_user_name, api_password, updated_at",
      )
      .eq("vending_software_id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { settings: emptySettings(), configured: false };

    return {
      configured: true,
      settings: {
        API_POS_PURCHASE: row.api_pos_purchase ?? "",
        API_LOGIN: row.api_login ?? "",
        API_MAINTENANCE_CLEAR_TAMPER: row.api_maintenance_clear_tamper ?? "",
        API_MAINTENANCE_CLEAR_CREDIT: row.api_maintenance_clear_credit ?? "",
        API_MAINTENANCE_SET_OVERDRAFT_LIMIT: row.api_maintenance_set_overdraft_limit ?? "",
        API_COMPANY_NAME: row.api_company_name ?? "",
        API_USER_NAME: row.api_user_name ?? "",
        has_password: Boolean(row.api_password),
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
      .select("id, api_password")
      .eq("vending_software_id", data.vending_software_id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);

    const storedPassword = existing?.api_password ?? null;
    const nextPassword = data.clear_password
      ? null
      : data.API_PASSWORD?.length
        ? data.API_PASSWORD
        : storedPassword;
    if (!nextPassword) throw new Error("API Password is required");

    const values = {
      vending_software_id: data.vending_software_id,
      api_pos_purchase: data.API_POS_PURCHASE,
      api_login: data.API_LOGIN || null,
      api_maintenance_clear_tamper: data.API_MAINTENANCE_CLEAR_TAMPER || null,
      api_maintenance_clear_credit: data.API_MAINTENANCE_CLEAR_CREDIT || null,
      api_maintenance_set_overdraft_limit: data.API_MAINTENANCE_SET_OVERDRAFT_LIMIT || null,
      api_company_name: data.API_COMPANY_NAME,
      api_user_name: data.API_USER_NAME,
      api_password: nextPassword,
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
          "API_COMPANY_NAME",
          "API_USER_NAME",
          ...(data.API_PASSWORD || data.clear_password ? ["API_PASSWORD"] : []),
        ],
      },
    });

    return { ok: true, has_password: true };
  });

export const testVendingSoftwareApiConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const supabase = context.supabase as any;
    await assertSoftwareExists(supabase, data.id);

    const { data: row, error } = await supabase
      .from("vending_software_api_settings")
      .select("api_login, api_company_name, api_user_name, api_password")
      .eq("vending_software_id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
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