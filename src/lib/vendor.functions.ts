import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { VendorScope } from "@/lib/vendor.server";

export type {
  VendorScope,
  VendorMeter,
  VendorZone,
  VendorResident,
} from "@/lib/vendor.server";

export const INSTALLATION_STATUSES = [
  "not_installed",
  "scheduled",
  "installed",
  "failed",
  "replaced",
] as const;

export function installationLabel(value: string | null | undefined): string {
  switch (value) {
    case "installed":
      return "Installed";
    case "scheduled":
      return "Installation scheduled";
    case "failed":
      return "Failed";
    case "replaced":
      return "Replaced";
    default:
      return "Not installed";
  }
}

const uuid = z.string().uuid();
const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9/_-]*$/;

const intOrNull = z
  .union([z.number().int(), z.string().trim(), z.null()])
  .optional()
  .transform((v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  });

const numOrZero = z
  .union([z.number(), z.string().trim(), z.null()])
  .optional()
  .transform((v) => {
    if (v === null || v === undefined || v === "") return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  });

/* ------------------------------------------------------------------ *
 * Reads
 * ------------------------------------------------------------------ */

/** Everything the signed-in vendor may see. The vendor id comes from the session. */
export const getVendorScope = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<VendorScope> => {
    const { assertVendor, loadVendorScope } = await import("@/lib/vendor.server");
    const vendorId = await assertVendor(context as never);
    return loadVendorScope(context.supabase as never, vendorId);
  });

export type VendorProfile = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  username: string | null;
  bio: string | null;
  status: string;
  profile_image: string | null;
  created_at: string;
};

export const getVendorProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<VendorProfile> => {
    const { assertVendor } = await import("@/lib/vendor.server");
    const vendorId = await assertVendor(context as never);
    const { data, error } = await context.supabase
      .from("users")
      .select("id, name, email, phone, username, bio, status, profile_image, created_at")
      .eq("id", vendorId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Vendor profile not found");
    return data as VendorProfile;
  });

export type VendorActivityEntry = {
  id: string;
  meter_id: string;
  action: string;
  changes: Record<string, unknown>;
  created_at: string;
};

/** Meter history for the vendor: whole account, or one meter. */
export const listVendorMeterActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ meter_id: uuid.optional(), limit: z.number().int().min(1).max(200).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { assertVendor } = await import("@/lib/vendor.server");
    await assertVendor(context as never);
    let query = context.supabase
      .from("meter_audit_logs")
      .select("id, meter_id, action, changes, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 25);
    if (data.meter_id) query = query.eq("meter_id", data.meter_id);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return { entries: (rows ?? []) as VendorActivityEntry[] };
  });

export type VendorPayment = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  reference: string | null;
  description: string | null;
  paid_at: string | null;
  created_at: string;
};

/** Payments recorded for one of the vendor's residents. */
export const listVendorResidentPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ resident_id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { assertVendor } = await import("@/lib/vendor.server");
    await assertVendor(context as never);
    const { data: rows, error } = await context.supabase
      .from("payments")
      .select("id, amount, currency, status, reference, description, paid_at, created_at")
      .eq("payee_id", data.resident_id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    const payments = (rows ?? []) as VendorPayment[];
    const completed = payments.filter((p) => p.status === "completed");
    return {
      payments,
      last_payment: completed[0] ?? null,
      total_paid: completed.reduce((sum, p) => sum + Number(p.amount ?? 0), 0),
    };
  });

/** Suppliers a vendor can pick when registering a meter. */
export const listVendorSuppliers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertVendor } = await import("@/lib/vendor.server");
    await assertVendor(context as never);
    const { data, error } = await context.supabase
      .from("meter_suppliers")
      .select("id, company_name, utility_type")
      .eq("status", "Active")
      .order("company_name", { ascending: true });
    if (error) throw new Error(error.message);
    return { suppliers: (data ?? []) as { id: string; company_name: string; utility_type: string }[] };
  });

/* ------------------------------------------------------------------ *
 * Meter writes
 * ------------------------------------------------------------------ */

const meterInput = z.object({
  meter_number: z
    .string()
    .trim()
    .min(4, "Meter number must be at least 4 characters")
    .max(64)
    .regex(IDENTIFIER_RE, "Meter number may only contain letters, numbers, - _ /"),
  serial_number: z
    .string()
    .trim()
    .min(4, "Serial number must be at least 4 characters")
    .max(64)
    .regex(IDENTIFIER_RE, "Serial number may only contain letters, numbers, - _ /"),
  type: z.enum(["electricity", "water", "gas"]),
  supplier_id: uuid.nullable().optional(),
  unit_id: uuid.nullable().optional(),
  status: z.enum(["active", "inactive"]).default("active"),
  installation_status: z.enum(INSTALLATION_STATUSES).default("not_installed"),
  price_per_unit: numOrZero,
  initial_reading: numOrZero,
  sgc: intOrNull,
  krn: intOrNull,
  ti: intOrNull,
  ea: intOrNull,
  ken: intOrNull,
});

async function assertUnitInScope(supabase: any, unitId: string) {
  const { data } = await supabase.from("units").select("id").eq("id", unitId).maybeSingle();
  if (!data) throw new Error("That unit is not part of your assigned zones");
}

async function assertMeterOwned(supabase: any, vendorId: string, meterId: string) {
  const { data } = await supabase
    .from("meters")
    .select("id, meter_number, unit_id, status, installation_status")
    .eq("id", meterId)
    .eq("vendor_id", vendorId)
    .maybeSingle();
  if (!data) throw new Error("Meter not found");
  return data as {
    id: string;
    meter_number: string;
    unit_id: string | null;
    status: string;
    installation_status: string;
  };
}

export const addVendorMeter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => meterInput.parse(d))
  .handler(async ({ data, context }) => {
    const { assertVendor, logVendorAction, notify } = await import("@/lib/vendor.server");
    const vendorId = await assertVendor(context as never);
    const supabase = context.supabase as any;

    if (data.meter_number.toLowerCase() === data.serial_number.toLowerCase()) {
      throw new Error("Meter number and serial number must be different");
    }
    if (data.unit_id) await assertUnitInScope(supabase, data.unit_id);

    const { data: created, error } = await supabase
      .from("meters")
      .insert({
        vendor_id: vendorId,
        supplier_id: data.supplier_id ?? null,
        unit_id: data.unit_id ?? null,
        meter_number: data.meter_number,
        serial_number: data.serial_number,
        type: data.type,
        status: data.status,
        installation_status: data.installation_status,
        price_per_unit: data.price_per_unit,
        initial_reading: data.initial_reading,
        sgc: data.sgc,
        krn: data.krn,
        ti: data.ti,
        ea: data.ea,
        ken: data.ken,
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("That meter number or serial number is already registered");
      throw new Error(error.message);
    }

    await logVendorAction(supabase, vendorId, "VENDOR_METER_CREATED", { type: "meter", id: created.id }, {
      meter_number: data.meter_number,
    });
    await notify(
      supabase,
      vendorId,
      "meter_created",
      "Meter added",
      `Meter ${data.meter_number} was added to your account.`,
      { type: "meter", id: created.id },
    );
    return { ok: true, id: created.id as string };
  });

export const setVendorMeterStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ meter_id: uuid, status: z.enum(["active", "inactive"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertVendor, logVendorAction, notify } = await import("@/lib/vendor.server");
    const vendorId = await assertVendor(context as never);
    const supabase = context.supabase as any;
    const meter = await assertMeterOwned(supabase, vendorId, data.meter_id);

    const { error } = await supabase
      .from("meters")
      .update({ status: data.status })
      .eq("id", data.meter_id)
      .eq("vendor_id", vendorId);
    if (error) throw new Error(error.message);

    await logVendorAction(
      supabase,
      vendorId,
      data.status === "active" ? "VENDOR_METER_ACTIVATED" : "VENDOR_METER_DEACTIVATED",
      { type: "meter", id: data.meter_id },
      { meter_number: meter.meter_number },
    );
    await notify(
      supabase,
      vendorId,
      "meter_status_changed",
      "Meter status changed",
      `Meter ${meter.meter_number} is now ${data.status}.`,
      { type: "meter", id: data.meter_id },
    );
    return { ok: true };
  });

export const updateVendorInstallation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        meter_id: uuid,
        installation_status: z.enum(INSTALLATION_STATUSES),
        installation_date: z.string().trim().max(40).nullable().optional(),
        installer: z.string().trim().max(120).nullable().optional(),
        installation_location: z.string().trim().max(200).nullable().optional(),
        installation_notes: z.string().trim().max(1000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertVendor, logVendorAction, notify } = await import("@/lib/vendor.server");
    const vendorId = await assertVendor(context as never);
    const supabase = context.supabase as any;
    const meter = await assertMeterOwned(supabase, vendorId, data.meter_id);

    const { error } = await supabase
      .from("meters")
      .update({
        installation_status: data.installation_status,
        installation_date: data.installation_date || null,
        installer: data.installer || null,
        installation_location: data.installation_location || null,
        installation_notes: data.installation_notes || null,
      })
      .eq("id", data.meter_id)
      .eq("vendor_id", vendorId);
    if (error) throw new Error(error.message);

    await logVendorAction(supabase, vendorId, "VENDOR_INSTALLATION_UPDATED", {
      type: "meter",
      id: data.meter_id,
    }, { meter_number: meter.meter_number, installation_status: data.installation_status });
    await notify(
      supabase,
      vendorId,
      "installation_updated",
      "Installation updated",
      `Meter ${meter.meter_number}: ${installationLabel(data.installation_status)}.`,
      { type: "meter", id: data.meter_id },
    );
    return { ok: true };
  });

export const assignVendorMeter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        meter_id: uuid,
        unit_id: uuid,
        reason: z.string().trim().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertVendor, logVendorAction, notify } = await import("@/lib/vendor.server");
    const vendorId = await assertVendor(context as never);
    const supabase = context.supabase as any;
    const meter = await assertMeterOwned(supabase, vendorId, data.meter_id);
    await assertUnitInScope(supabase, data.unit_id);

    const { data: clash } = await supabase
      .from("meters")
      .select("id, meter_number")
      .eq("unit_id", data.unit_id)
      .neq("id", data.meter_id)
      .maybeSingle();
    if (clash) throw new Error(`Meter ${clash.meter_number} is already assigned to that unit`);

    const { error } = await supabase
      .from("meters")
      .update({ unit_id: data.unit_id })
      .eq("id", data.meter_id)
      .eq("vendor_id", vendorId);
    if (error) throw new Error(error.message);

    await logVendorAction(supabase, vendorId, "VENDOR_METER_ASSIGNED", {
      type: "meter",
      id: data.meter_id,
    }, {
      meter_number: meter.meter_number,
      previous_unit_id: meter.unit_id,
      new_unit_id: data.unit_id,
      reason: data.reason ?? null,
    });
    await notify(
      supabase,
      vendorId,
      "meter_assigned",
      meter.unit_id ? "Meter assignment changed" : "Meter assigned",
      `Meter ${meter.meter_number} is now assigned to a new unit.`,
      { type: "meter", id: data.meter_id },
    );
    return { ok: true };
  });

export const unassignVendorMeter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ meter_id: uuid, reason: z.string().trim().max(500).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertVendor, logVendorAction, notify } = await import("@/lib/vendor.server");
    const vendorId = await assertVendor(context as never);
    const supabase = context.supabase as any;
    const meter = await assertMeterOwned(supabase, vendorId, data.meter_id);
    if (!meter.unit_id) throw new Error("This meter is not assigned to a unit");

    const { error } = await supabase
      .from("meters")
      .update({ unit_id: null })
      .eq("id", data.meter_id)
      .eq("vendor_id", vendorId);
    if (error) throw new Error(error.message);

    await logVendorAction(supabase, vendorId, "VENDOR_METER_UNASSIGNED", {
      type: "meter",
      id: data.meter_id,
    }, { meter_number: meter.meter_number, previous_unit_id: meter.unit_id, reason: data.reason ?? null });
    return { ok: true };
  });

const bulkRow = z.object({
  meter_number: z.string().trim().min(1),
  serial_number: z.string().trim().optional(),
  sgc: z.string().trim().optional(),
  krn: z.string().trim().optional(),
  ti: z.string().trim().optional(),
  ea: z.string().trim().optional(),
  ken: z.string().trim().optional(),
});

export type VendorBulkResult = {
  ok: boolean;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  results: { row: number; meter_number: string; serial_number: string; status: string; message: string }[];
};

/** All-or-nothing batch insert; the vendor is forced to the signed-in account. */
export const bulkAddVendorMeters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        supplier_id: uuid.nullable().optional(),
        type: z.enum(["electricity", "water", "gas"]),
        price_per_unit: numOrZero,
        initial_reading: numOrZero,
        rows: z.array(bulkRow).min(1).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertVendor, logVendorAction, notify } = await import("@/lib/vendor.server");
    const vendorId = await assertVendor(context as never);
    const supabase = context.supabase as any;

    const { data: result, error } = await supabase.rpc("bulk_add_meters", {
      p_payload: {
        supplier_id: data.supplier_id ?? null,
        owner_type: "vendor",
        owner_id: vendorId,
        type: data.type,
        price_per_unit: data.price_per_unit,
        initial_reading: data.initial_reading,
        duplicate_mode: "reject",
        rows: data.rows,
      },
    });
    if (error) throw new Error(error.message);

    const summary = result as VendorBulkResult;
    await logVendorAction(supabase, vendorId, "VENDORS_METERS_BULK_CREATED", { type: "meter" }, {
      count: summary.created,
      supplier_id: data.supplier_id ?? null,
    });
    await notify(
      supabase,
      vendorId,
      "meters_bulk_created",
      "Meters added",
      `${summary.created} meters were added to your account.`,
      { type: "meter" },
    );
    return summary;
  });

/* ------------------------------------------------------------------ *
 * Profile
 * ------------------------------------------------------------------ */

export const updateVendorProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        name: z.string().trim().max(120).nullable().optional(),
        phone: z.string().trim().max(40).nullable().optional(),
        username: z.string().trim().max(60).nullable().optional(),
        bio: z.string().trim().max(1000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertVendor, logVendorAction } = await import("@/lib/vendor.server");
    const vendorId = await assertVendor(context as never);
    const supabase = context.supabase as any;
    const { error } = await supabase
      .from("users")
      .update({
        name: data.name || null,
        phone: data.phone || null,
        username: data.username || null,
        bio: data.bio || null,
        updated_by: vendorId,
      })
      .eq("id", vendorId);
    if (error) throw new Error(error.message);
    await logVendorAction(supabase, vendorId, "VENDOR_PROFILE_UPDATED", { type: "user", id: vendorId });
    return { ok: true };
  });

export const setVendorPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ profile_image: z.string().trim().max(2000).nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertVendor, logVendorAction } = await import("@/lib/vendor.server");
    const vendorId = await assertVendor(context as never);
    const supabase = context.supabase as any;
    const { error } = await supabase
      .from("users")
      .update({ profile_image: data.profile_image, updated_by: vendorId })
      .eq("id", vendorId);
    if (error) throw new Error(error.message);
    await logVendorAction(supabase, vendorId, "VENDOR_PROFILE_PHOTO_UPDATED", {
      type: "user",
      id: vendorId,
    });
    return { ok: true };
  });
