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

export type MeterType = "electricity" | "water" | "gas";

export type MeterRow = {
  id: string;
  vendor_id: string;
  landlord_id: string | null;
  landlord_name: string | null;
  meter_number: string;
  serial_number: string;
  type: MeterType | string;
  initial_reading: number;
  price_per_unit: number;
  status: string;
  sgc: number | null;
  krn: number | null;
  ti: number | null;
  ea: number | null;
  ken: number | null;
  created_at: string;
  updated_at: string;
};

const METER_COLUMNS =
  "id, vendor_id, landlord_id, meter_number, serial_number, type, initial_reading, price_per_unit, status, sgc, krn, ti, ea, ken, created_at, updated_at";

const intOrNull = z
  .union([z.number().int(), z.string().trim()])
  .nullable()
  .optional()
  .transform((v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  });

const numOrZero = z
  .union([z.number(), z.string().trim()])
  .nullable()
  .optional()
  .transform((v) => {
    if (v === null || v === undefined || v === "") return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  });

/** Meter / serial identifiers: alphanumeric with dashes, underscores or slashes. */
const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9/_-]*$/;

const identifier = (label: string) =>
  z
    .string()
    .trim()
    .min(4, `${label} must be at least 4 characters`)
    .max(64, `${label} must be at most 64 characters`)
    .regex(IDENTIFIER_RE, `${label} may only contain letters, numbers, - _ /`);

const meterInput = z.object({
  vendor_id: z.string().trim().min(1, "Vendor is required").max(255),
  landlord_id: uuid.nullable().optional(),
  meter_number: identifier("Meter number"),
  serial_number: identifier("Serial number"),
  type: z.enum(["electricity", "water", "gas"]),
  initial_reading: numOrZero,
  price_per_unit: numOrZero,
  status: z.enum(["active", "inactive"]).optional(),
  sgc: intOrNull,
  krn: intOrNull,
  ti: intOrNull,
  ea: intOrNull,
  ken: intOrNull,
});

const meterUpdateInput = meterInput.extend({ id: uuid });

/**
 * Reject a meter number / serial number that is already used by another meter.
 * `excludeId` skips the row being edited.
 */
async function assertMeterIdentifiersFree(
  supabase: any,
  values: { meter_number: string; serial_number: string },
  excludeId?: string,
) {
  if (values.meter_number.toLowerCase() === values.serial_number.toLowerCase()) {
    throw new Error("Meter number and serial number must be different");
  }

  let query = supabase
    .from("meters")
    .select("id, meter_number, serial_number")
    .or(
      `meter_number.ilike.${values.meter_number},serial_number.ilike.${values.serial_number}`,
    );
  if (excludeId) query = query.neq("id", excludeId);

  const { data: clashes, error } = await query;
  if (error) throw new Error(error.message);

  for (const row of clashes ?? []) {
    if (String(row.meter_number).toLowerCase() === values.meter_number.toLowerCase()) {
      throw new Error(`Meter number ${values.meter_number} is already registered`);
    }
    if (String(row.serial_number).toLowerCase() === values.serial_number.toLowerCase()) {
      throw new Error(`Serial number ${values.serial_number} is already registered`);
    }
  }
}


/** All meters from the meters registry, plus landlord options. */
export const listMeters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabase } = context;

    const { data: rows, error } = await supabase
      .from("meters")
      .select(METER_COLUMNS)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const landlordIds = [
      ...new Set((rows ?? []).map((r: any) => r.landlord_id).filter((v: any): v is string => !!v)),
    ];

    let landlordRows: any[] = [];
    if (landlordIds.length) {
      const { data: l, error: lErr } = await supabase
        .from("users")
        .select("id, name, email")
        .in("id", landlordIds);
      if (lErr) throw new Error(lErr.message);
      landlordRows = l ?? [];
    }
    const landlordById = new Map(landlordRows.map((l) => [l.id, l]));

    // Every landlord available for assignment in the Add Meter dialog.
    const { data: landlordRoleRows } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "landlord");
    const optionIds = [...new Set((landlordRoleRows ?? []).map((r: any) => r.user_id as string))];
    let landlordOptions: { id: string; name: string }[] = [];
    if (optionIds.length) {
      const { data: opts } = await supabase
        .from("users")
        .select("id, name, email")
        .in("id", optionIds);
      landlordOptions = (opts ?? []).map((u: any) => ({
        id: u.id as string,
        name: (u.name as string) || (u.email as string) || "Unnamed landlord",
      }));
      landlordOptions.sort((a, b) => a.name.localeCompare(b.name));
    }

    const meters: MeterRow[] = (rows ?? []).map((r: any) => {
      const landlord = r.landlord_id ? landlordById.get(r.landlord_id) : null;
      return {
        id: r.id,
        vendor_id: r.vendor_id ?? "",
        landlord_id: r.landlord_id ?? null,
        landlord_name: (landlord?.name as string) ?? (landlord?.email as string) ?? null,
        meter_number: r.meter_number ?? "",
        serial_number: r.serial_number ?? "",
        type: (r.type ?? "").toLowerCase(),
        initial_reading: Number(r.initial_reading ?? 0),
        price_per_unit: Number(r.price_per_unit ?? 0),
        status: (r.status ?? "active").toLowerCase(),
        sgc: r.sgc ?? null,
        krn: r.krn ?? null,
        ti: r.ti ?? null,
        ea: r.ea ?? null,
        ken: r.ken ?? null,
        created_at: r.created_at,
        updated_at: r.updated_at,
      };
    });

    return { meters, landlords: landlordOptions };
  });

export const addMeter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => meterInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabase } = context;

    const { data: existing, error: exErr } = await supabase
      .from("meters")
      .select("id")
      .eq("meter_number", data.meter_number)
      .maybeSingle();
    if (exErr) throw new Error(exErr.message);
    if (existing) throw new Error(`Meter number ${data.meter_number} already exists`);

    const { data: inserted, error } = await supabase
      .from("meters")
      .insert({
        vendor_id: data.vendor_id,
        landlord_id: data.landlord_id ?? null,
        meter_number: data.meter_number,
        serial_number: data.serial_number,
        type: data.type,
        initial_reading: data.initial_reading,
        price_per_unit: data.price_per_unit,
        status: data.status ?? "active",
        sgc: data.sgc,
        krn: data.krn,
        ti: data.ti,
        ea: data.ea,
        ken: data.ken,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    return { ok: true, id: inserted?.id as string };
  });

const bulkMeterInput = z.object({
  action: z.enum(["delete", "deactivate", "activate"]),
  ids: z.array(uuid).min(1).max(500),
});

/** Delete / deactivate / activate many meters at once. */
export const bulkMeterAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => bulkMeterInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabase } = context;

    if (data.action === "delete") {
      const { error } = await supabase.from("meters").delete().in("id", data.ids);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from("meters")
        .update({ status: data.action === "activate" ? "active" : "inactive" } as never)
        .in("id", data.ids);
      if (error) throw new Error(error.message);
    }

    return { ok: true, meters: data.ids.length };
  });
