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
