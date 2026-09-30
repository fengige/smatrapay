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

export type SupplierStatus = "Active" | "Inactive" | "Suspended";
export type UtilityType = "Electricity" | "Water" | "Gas" | "Multi-Utility";

export type SupplierRow = {
  id: string;
  company_name: string;
  license_number: string | null;
  utility_type: UtilityType;
  contact_name: string | null;
  email: string | null;
  phone_number: string | null;
  website_url: string | null;
  status: SupplierStatus;
  logo_url: string | null;
  meter_count: number;
  created_at: string;
  updated_at: string;
};

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null));

const supplierInput = z.object({
  company_name: z.string().trim().min(2, "Company name is required").max(150),
  license_number: optionalText(50),
  utility_type: z.enum(["Electricity", "Water", "Gas", "Multi-Utility"]),
  contact_name: optionalText(100),
  email: z
    .string()
    .trim()
    .max(100)
    .nullable()
    .optional()
    .transform((v) => (v ? v.toLowerCase() : null))
    .refine((v) => !v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "Enter a valid email address"),
  phone_number: optionalText(20),
  website_url: optionalText(255),
  status: z.enum(["Active", "Inactive", "Suspended"]).default("Active"),
});

const supplierUpdateInput = supplierInput.extend({ id: uuid });

const SUPPLIER_COLUMNS =
  "id, company_name, license_number, utility_type, contact_name, email, phone_number, website_url, status, logo_url, created_at, updated_at";

export const listSuppliers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabase } = context;

    const { data: rows, error } = await supabase
      .from("meter_suppliers")
      .select(SUPPLIER_COLUMNS)
      .order("company_name", { ascending: true });
    if (error) throw new Error(error.message);

    const { data: meterRows } = await supabase.from("meters").select("supplier_id");
    const counts = new Map<string, number>();
    for (const m of (meterRows ?? []) as any[]) {
      if (!m.supplier_id) continue;
      counts.set(m.supplier_id, (counts.get(m.supplier_id) ?? 0) + 1);
    }

    const suppliers: SupplierRow[] = (rows ?? []).map((r: any) => ({
      id: r.id,
      company_name: r.company_name ?? "",
      license_number: r.license_number ?? null,
      utility_type: r.utility_type,
      contact_name: r.contact_name ?? null,
      email: r.email ?? null,
      phone_number: r.phone_number ?? null,
      website_url: r.website_url ?? null,
      status: r.status,
      logo_url: r.logo_url ?? null,
      meter_count: counts.get(r.id) ?? 0,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));

    return { suppliers };
  });

export const addSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => supplierInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { data: inserted, error } = await context.supabase
      .from("meter_suppliers")
      .insert(data as never)
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("License number or email is already in use");
      throw new Error(error.message);
    }
    return { ok: true, id: inserted?.id as string };
  });

export const updateSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => supplierUpdateInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { id, ...values } = data;
    const { error } = await context.supabase
      .from("meter_suppliers")
      .update(values as never)
      .eq("id", id);
    if (error) {
      if (error.code === "23505") throw new Error("License number or email is already in use");
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const setSupplierStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: uuid, status: z.enum(["Active", "Inactive", "Suspended"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { error } = await context.supabase
      .from("meter_suppliers")
      .update({ status: data.status } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------------ *
 * Supplier details page
 * ------------------------------------------------------------------ */

export type SupplierMeterRow = {
  id: string;
  meter_number: string;
  serial_number: string;
  type: string;
  status: string;
  owner_type: "Vendor" | "Landlord" | "Agent" | null;
  owner_name: string | null;
  sgc: number | null;
  krn: number | null;
  ti: number | null;
  ea: number | null;
  ken: number | null;
  created_at: string;
};

export type SupplierDetail = SupplierRow & {
  meters: SupplierMeterRow[];
};

/** Full record for one supplier, plus every meter that belongs to it. */
export const getSupplier = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabase } = context;

    const { data: row, error } = await supabase
      .from("meter_suppliers")
      .select(SUPPLIER_COLUMNS)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Supplier not found");

    const { data: meterRows, error: mErr } = await supabase
      .from("meters")
      .select(
        "id, meter_number, serial_number, type, status, vendor_id, landlord_id, agent_id, sgc, krn, ti, ea, ken, created_at",
      )
      .eq("supplier_id", data.id)
      .order("created_at", { ascending: false });
    if (mErr) throw new Error(mErr.message);

    const personIds = [
      ...new Set(
        (meterRows ?? [])
          .flatMap((m: any) => [m.landlord_id, m.agent_id, m.vendor_id])
          .filter((v: any): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v)),
      ),
    ];
    let people: any[] = [];
    if (personIds.length) {
      const { data: users } = await supabase.from("users").select("id, name, email").in("id", personIds);
      people = users ?? [];
    }
    const nameById = new Map(people.map((p) => [p.id, (p.name as string) || (p.email as string) || null]));

    const meters: SupplierMeterRow[] = (meterRows ?? []).map((m: any) => {
      let owner_type: SupplierMeterRow["owner_type"] = null;
      let owner_name: string | null = null;
      if (m.landlord_id) {
        owner_type = "Landlord";
        owner_name = nameById.get(m.landlord_id) ?? null;
      } else if (m.agent_id) {
        owner_type = "Agent";
        owner_name = nameById.get(m.agent_id) ?? null;
      } else if (m.vendor_id) {
        owner_type = "Vendor";
        owner_name = nameById.get(m.vendor_id) ?? (m.vendor_id as string);
      }
      return {
        id: m.id,
        meter_number: m.meter_number ?? "",
        serial_number: m.serial_number ?? "",
        type: String(m.type ?? "").toLowerCase(),
        status: String(m.status ?? "active").toLowerCase(),
        owner_type,
        owner_name,
        sgc: m.sgc ?? null,
        krn: m.krn ?? null,
        ti: m.ti ?? null,
        ea: m.ea ?? null,
        ken: m.ken ?? null,
        created_at: m.created_at,
      };
    });

    const supplier: SupplierDetail = {
      id: row.id,
      company_name: row.company_name ?? "",
      license_number: row.license_number ?? null,
      utility_type: row.utility_type,
      contact_name: row.contact_name ?? null,
      email: row.email ?? null,
      phone_number: row.phone_number ?? null,
      website_url: row.website_url ?? null,
      status: row.status,
      logo_url: row.logo_url ?? null,
      meter_count: meters.length,
      created_at: row.created_at,
      updated_at: row.updated_at,
      meters,
    };

    return { supplier };
  });

/** Save or clear the supplier's profile photo. */
export const setSupplierLogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: uuid, logo_url: z.string().trim().max(2000).nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { error } = await context.supabase
      .from("meter_suppliers")
      .update({ logo_url: data.logo_url || null } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------------ *
 * Supplier API settings (admin only)
 * ------------------------------------------------------------------ */

export type SupplierApiSettings = {
  API_POS_PURCHASE: string;
  API_LOGIN: string;
  API_MAINTENANCE_CLEAR_TAMPER: string;
  API_MAINTENANCE_CLEAR_CREDIT: string;
  API_MAINTENANCE_SET_OVERDRAFT_LIMIT: string;
  API_COMPANY_NAME: string;
  API_USER_NAME: string;
  /** Never the real value — true when a password is stored. */
  has_password: boolean;
  updated_at: string | null;
};

const URL_FIELDS = [
  "API_POS_PURCHASE",
  "API_LOGIN",
  "API_MAINTENANCE_CLEAR_TAMPER",
  "API_MAINTENANCE_CLEAR_CREDIT",
  "API_MAINTENANCE_SET_OVERDRAFT_LIMIT",
] as const;

const urlField = z
  .string()
  .trim()
  .max(500)
  .optional()
  .default("")
  .refine(
    (v) => !v || /^https?:\/\/[^\s]+$/i.test(v),
    "Enter a valid URL starting with http:// or https://",
  );

const textField = z.string().trim().max(150).optional().default("");

const apiSettingsInput = z.object({
  supplier_id: uuid,
  /** null = the supplier-wide default configuration. */
  vending_software_id: z.string().uuid().nullable().optional().default(null),
  API_POS_PURCHASE: urlField,
  API_LOGIN: urlField,
  API_MAINTENANCE_CLEAR_TAMPER: urlField,
  API_MAINTENANCE_CLEAR_CREDIT: urlField,
  API_MAINTENANCE_SET_OVERDRAFT_LIMIT: urlField,
  API_COMPANY_NAME: textField,
  API_USER_NAME: textField,
  /** Omit or leave null to keep the stored password unchanged. */
  API_PASSWORD: z.string().max(200).nullable().optional(),
  clear_password: z.boolean().optional().default(false),
});

const emptySettings = (): SupplierApiSettings => ({
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

async function assertSupplierExists(supabase: any, id: string) {
  const { data, error } = await supabase
    .from("meter_suppliers")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Supplier not found");
}

const softwareKey = z.string().uuid().nullable().optional().default(null);

function scopeToSoftware(query: any, softwareId: string | null) {
  return softwareId ? query.eq("vending_software_id", softwareId) : query.is("vending_software_id", null);
}

async function listVendingSoftware(supabase: any) {
  const { data, error } = await supabase
    .from("vending_software")
    .select("vending_software_id, name, status")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as { vending_software_id: string; name: string; status: string }[];
}

export type SupplierApiSoftwareOption = {
  id: string | null;
  name: string;
  configured: boolean;
};

/**
 * API configuration for one supplier and one vending software.
 * Pass `vending_software_id: null` for the supplier-wide default.
 * The password is never returned.
 */
export const getSupplierApiSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid, vending_software_id: softwareKey }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const supabase = context.supabase as any;
    await assertSupplierExists(supabase, data.id);

    const softwareId = data.vending_software_id ?? null;

    const [softwareList, allRows] = await Promise.all([
      listVendingSoftware(supabase),
      supabase
        .from("meter_supplier_api_settings")
        .select(
          "vending_software_id, api_pos_purchase, api_login, api_maintenance_clear_tamper, api_maintenance_clear_credit, api_maintenance_set_overdraft_limit, api_company_name, api_user_name, api_password, updated_at",
        )
        .eq("meter_supplier_id", data.id),
    ]);
    if (allRows.error) throw new Error(allRows.error.message);
    const rows = (allRows.data ?? []) as any[];

    const configuredIds = new Set(rows.map((r) => r.vending_software_id ?? "__default__"));
    const software: SupplierApiSoftwareOption[] = [
      { id: null, name: "Default (all vending software)", configured: configuredIds.has("__default__") },
      ...softwareList.map((s) => ({
        id: s.vending_software_id,
        name: s.name,
        configured: configuredIds.has(s.vending_software_id),
      })),
    ];

    const row = rows.find((r) => (r.vending_software_id ?? null) === softwareId);
    if (!row) return { settings: emptySettings(), software, vending_software_id: softwareId };

    const settings: SupplierApiSettings = {
      API_POS_PURCHASE: row.api_pos_purchase ?? "",
      API_LOGIN: row.api_login ?? "",
      API_MAINTENANCE_CLEAR_TAMPER: row.api_maintenance_clear_tamper ?? "",
      API_MAINTENANCE_CLEAR_CREDIT: row.api_maintenance_clear_credit ?? "",
      API_MAINTENANCE_SET_OVERDRAFT_LIMIT: row.api_maintenance_set_overdraft_limit ?? "",
      API_COMPANY_NAME: row.api_company_name ?? "",
      API_USER_NAME: row.api_user_name ?? "",
      has_password: Boolean(row.api_password),
      updated_at: row.updated_at ?? null,
    };
    return { settings, software, vending_software_id: softwareId };
  });

/** Create or update one supplier + vending software API configuration. */
export const saveSupplierApiSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => apiSettingsInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const supabase = context.supabase as any;
    await assertSupplierExists(supabase, data.supplier_id);

    const softwareId = data.vending_software_id ?? null;
    if (softwareId) {
      const { data: sw, error: swErr } = await supabase
        .from("vending_software")
        .select("vending_software_id")
        .eq("vending_software_id", softwareId)
        .maybeSingle();
      if (swErr) throw new Error(swErr.message);
      if (!sw) throw new Error("Invalid vending software selected");
    }

    const urls = URL_FIELDS.map((k) => (data as any)[k] as string).filter(Boolean);
    if (new Set(urls).size !== urls.length) {
      throw new Error("Each API endpoint must be a different URL");
    }

    const { data: existing, error: readErr } = await scopeToSoftware(
      supabase
        .from("meter_supplier_api_settings")
        .select("id, api_pos_purchase, api_login, api_maintenance_clear_tamper, api_maintenance_clear_credit, api_maintenance_set_overdraft_limit, api_company_name, api_user_name, api_password")
        .eq("meter_supplier_id", data.supplier_id),
      softwareId,
    ).maybeSingle();
    if (readErr) throw new Error(readErr.message);

    const values: Record<string, unknown> = {
      meter_supplier_id: data.supplier_id,
      vending_software_id: softwareId,
      api_pos_purchase: data.API_POS_PURCHASE || null,
      api_login: data.API_LOGIN || null,
      api_maintenance_clear_tamper: data.API_MAINTENANCE_CLEAR_TAMPER || null,
      api_maintenance_clear_credit: data.API_MAINTENANCE_CLEAR_CREDIT || null,
      api_maintenance_set_overdraft_limit: data.API_MAINTENANCE_SET_OVERDRAFT_LIMIT || null,
      api_company_name: data.API_COMPANY_NAME || null,
      api_user_name: data.API_USER_NAME || null,
    };

    let passwordChanged = false;
    if (data.clear_password) {
      values["api_password"] = null;
      passwordChanged = Boolean(existing?.api_password);
    } else if (typeof data.API_PASSWORD === "string" && data.API_PASSWORD.length > 0) {
      values["api_password"] = data.API_PASSWORD;
      passwordChanged = true;
    }

    const changed: string[] = [];
    const compare: [string, string][] = [
      ["API_POS_PURCHASE", "api_pos_purchase"],
      ["API_LOGIN", "api_login"],
      ["API_MAINTENANCE_CLEAR_TAMPER", "api_maintenance_clear_tamper"],
      ["API_MAINTENANCE_CLEAR_CREDIT", "api_maintenance_clear_credit"],
      ["API_MAINTENANCE_SET_OVERDRAFT_LIMIT", "api_maintenance_set_overdraft_limit"],
      ["API_COMPANY_NAME", "api_company_name"],
      ["API_USER_NAME", "api_user_name"],
    ];
    for (const [label, column] of compare) {
      if ((existing?.[column] ?? null) !== (values[column] ?? null)) changed.push(label);
    }
    if (passwordChanged) changed.push("API_PASSWORD");

    if (existing) {
      const { error } = await supabase
        .from("meter_supplier_api_settings")
        .update(values as never)
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from("meter_supplier_api_settings")
        .insert(values as never);
      if (error) {
        if (error.code === "23505")
          throw new Error("API settings already exist for this supplier and vending software");
        throw new Error(error.message);
      }
    }

    // Audit trail — field names only, never credential values.
    await supabase.from("meter_supplier_audit_logs").insert({
      supplier_id: data.supplier_id,
      actor_id: context.userId,
      action: existing ? "api_settings_updated" : "api_settings_created",
      changes: { fields: changed, vending_software_id: softwareId },
    } as never);

    return { ok: true, has_password: Boolean(values["api_password"] ?? (data.clear_password ? null : existing?.api_password)) };
  });

/** Remove one vending software's configuration so it falls back to the default. */
export const deleteSupplierApiSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: uuid, vending_software_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const supabase = context.supabase as any;
    const { error } = await supabase
      .from("meter_supplier_api_settings")
      .delete()
      .eq("meter_supplier_id", data.id)
      .eq("vending_software_id", data.vending_software_id);
    if (error) throw new Error(error.message);

    await supabase.from("meter_supplier_audit_logs").insert({
      supplier_id: data.id,
      actor_id: context.userId,
      action: "api_settings_deleted",
      changes: { vending_software_id: data.vending_software_id },
    } as never);
    return { ok: true };
  });

/**
 * Endpoints a meter should use: its supplier's configuration for the meter's
 * vending software, falling back to the supplier default. Credentials stay server-side.
 */
export async function resolveMeterApiEndpoints(
  supabase: any,
  supplierId: string,
  vendingSoftwareId: string | null,
): Promise<{
  source: "supplier_software" | "supplier_default" | "vending_software" | "none";
  api_pos_purchase: string | null;
  api_login: string | null;
  api_maintenance_clear_tamper: string | null;
  api_maintenance_clear_credit: string | null;
  api_maintenance_set_overdraft_limit: string | null;
  api_company_name: string | null;
  api_user_name: string | null;
  api_password: string | null;
}> {
  const { data, error } = await supabase
    .from("meter_supplier_api_settings")
    .select(
      "vending_software_id, api_pos_purchase, api_login, api_maintenance_clear_tamper, api_maintenance_clear_credit, api_maintenance_set_overdraft_limit, api_company_name, api_user_name, api_password",
    )
    .eq("meter_supplier_id", supplierId);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as any[];
  const match =
    (vendingSoftwareId && rows.find((r) => r.vending_software_id === vendingSoftwareId)) || null;
  const fallback = rows.find((r) => r.vending_software_id === null) ?? null;
  const row = match ?? fallback;
  if (!row && vendingSoftwareId) {
    const { data: softwareSettings, error: softwareError } = await supabase
      .from("vending_software_api_settings")
      .select(
        "api_pos_purchase, api_login, api_maintenance_clear_tamper, api_maintenance_clear_credit, api_maintenance_set_overdraft_limit, api_company_name, api_user_name, api_password",
      )
      .eq("vending_software_id", vendingSoftwareId)
      .maybeSingle();
    if (softwareError) throw new Error(softwareError.message);
    return {
      source: softwareSettings ? "vending_software" : "none",
      api_pos_purchase: softwareSettings?.api_pos_purchase ?? null,
      api_login: softwareSettings?.api_login ?? null,
      api_maintenance_clear_tamper: softwareSettings?.api_maintenance_clear_tamper ?? null,
      api_maintenance_clear_credit: softwareSettings?.api_maintenance_clear_credit ?? null,
      api_maintenance_set_overdraft_limit:
        softwareSettings?.api_maintenance_set_overdraft_limit ?? null,
      api_company_name: softwareSettings?.api_company_name ?? null,
      api_user_name: softwareSettings?.api_user_name ?? null,
      api_password: softwareSettings?.api_password ?? null,
    };
  }
  return {
    source: match ? "supplier_software" : fallback ? "supplier_default" : "none",
    api_pos_purchase: row?.api_pos_purchase ?? null,
    api_login: row?.api_login ?? null,
    api_maintenance_clear_tamper: row?.api_maintenance_clear_tamper ?? null,
    api_maintenance_clear_credit: row?.api_maintenance_clear_credit ?? null,
    api_maintenance_set_overdraft_limit: row?.api_maintenance_set_overdraft_limit ?? null,
    api_company_name: row?.api_company_name ?? null,
    api_user_name: row?.api_user_name ?? null,
    api_password: row?.api_password ?? null,
  };
}

/** Which endpoints a given meter resolves to (no credentials returned). */
export const getMeterApiEndpoints = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ meter_id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const supabase = context.supabase as any;
    const { data: meter, error } = await supabase
      .from("meters")
      .select("id, supplier_id, vending_software_id")
      .eq("id", data.meter_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!meter) throw new Error("Meter not found");
    if (!meter.supplier_id) {
      return { source: "none" as const, endpoints: null };
    }
    const resolved = await resolveMeterApiEndpoints(
      supabase,
      meter.supplier_id,
      meter.vending_software_id ?? null,
    );
    const { api_password: _pw, source, ...endpoints } = resolved;
    return { source, endpoints };
  });

/** Check the configured login endpoint responds with the stored credentials. */
export const testSupplierApiConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid, vending_software_id: softwareKey }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const supabase = context.supabase as any;

    const { data: row, error } = await scopeToSoftware(
      supabase
        .from("meter_supplier_api_settings")
        .select("api_login, api_company_name, api_user_name, api_password")
        .eq("meter_supplier_id", data.id),
      data.vending_software_id ?? null,
    ).maybeSingle();
    if (error) throw new Error(error.message);

    if (!row?.api_login || !row.api_user_name || !row.api_password) {
      return { status: "invalid" as const, message: "Invalid Configuration" };
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(row.api_login, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: row.api_company_name ?? "",
          username: row.api_user_name,
          password: row.api_password,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.status === 401 || res.status === 403) {
        return { status: "auth_failed" as const, message: "Authentication Failed" };
      }
      if (!res.ok) {
        return { status: "unreachable" as const, message: `Endpoint Unreachable (${res.status})` };
      }
      return { status: "ok" as const, message: "Connection Successful" };
    } catch {
      return { status: "unreachable" as const, message: "Endpoint Unreachable" };
    }
  });
