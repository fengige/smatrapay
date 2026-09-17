import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Counter sales (POS) for the Vendor Portal.
 * The vendor is always resolved from the authenticated session and every meter,
 * token and receipt is re-checked against that vendor's own meters.
 */

const uuid = z.string().uuid();

export type VendorPosMeter = {
  id: string;
  meter_number: string;
  serial_number: string;
  type: string;
  status: string;
  price_per_unit: number;
  unit_label: string | null;
  property_name: string | null;
  zone_name: string | null;
  vending_software_name: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
};

export type VendorPosToken = {
  id: string;
  meter_id: string;
  meter_number: string;
  token: string;
  units: number;
  amount: number;
  reference: string | null;
  customer_phone: string | null;
  sms_requested: boolean;
  status: "issued" | "revoked" | "expired";
  expires_at: string;
  method: string;
  cashier: string;
  created_at: string;
};

export type VendorPosSmsLog = {
  id: string;
  token_id: string;
  phone: string;
  status: "queued" | "sent" | "failed";
  error: string | null;
  actor_name: string | null;
  created_at: string;
};

export const VENDOR_POS_METHODS = ["cash", "mpesa", "card", "bank", "other"] as const;

/** Payment method is stored as an uppercase prefix on the token reference. */
function methodFrom(reference: string | null): string {
  const first = (reference ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return (VENDOR_POS_METHODS as readonly string[]).includes(first) ? first : "other";
}

function effectiveStatus(row: any): "issued" | "revoked" | "expired" {
  if (row.status === "issued" && new Date(row.expires_at).getTime() < Date.now()) return "expired";
  return row.status;
}

/** 20-digit STS-style token, formatted in groups of four. */
function generateTokenValue() {
  let out = "";
  for (let i = 0; i < 20; i += 1) out += Math.floor(Math.random() * 10);
  return out.replace(/(\d{4})(?=\d)/g, "$1-");
}

async function vendorMeterIds(supabase: any, vendorId: string): Promise<string[]> {
  const { data } = await supabase.from("meters").select("id").eq("vendor_id", vendorId);
  return ((data ?? []) as any[]).map((m) => m.id as string);
}

async function serialize(supabase: any, rows: any[]): Promise<VendorPosToken[]> {
  if (!rows.length) return [];
  const meterIds = [...new Set(rows.map((r) => r.meter_id))];
  const { data: meters } = await supabase.from("meters").select("id, meter_number").in("id", meterIds);
  const meterById = new Map<string, string>(
    ((meters ?? []) as any[]).map((m) => [m.id as string, m.meter_number as string]),
  );

  const actorIds = [...new Set(rows.map((r) => r.issued_by).filter(Boolean))] as string[];
  const actorById = new Map<string, string>();
  if (actorIds.length) {
    const { data: users } = await supabase.from("users").select("id, name, email").in("id", actorIds);
    for (const u of (users ?? []) as any[]) actorById.set(u.id, u.name ?? u.email ?? u.id);
  }

  return rows.map((r) => ({
    id: r.id,
    meter_id: r.meter_id,
    meter_number: meterById.get(r.meter_id) ?? "—",
    token: r.token,
    units: Number(r.units ?? 0),
    amount: Number(r.amount ?? 0),
    reference: r.reference ?? null,
    customer_phone: r.customer_phone ?? null,
    sms_requested: !!r.sms_requested,
    status: effectiveStatus(r),
    expires_at: r.expires_at,
    method: methodFrom(r.reference ?? null),
    cashier: r.issued_by ? (actorById.get(r.issued_by) ?? "Unknown") : "System",
    created_at: r.created_at,
  }));
}

/** Look up one of the vendor's own meters by number, serial or resident name/phone. */
export const searchVendorPosMeters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ q: z.string().trim().min(2, "Enter at least 2 characters") }).parse(d),
  )
  .handler(async ({ data, context }): Promise<VendorPosMeter[]> => {
    const { assertVendor, loadVendorScope } = await import("@/lib/vendor.server");
    const vendorId = await assertVendor(context as never);
    const scope = await loadVendorScope(context.supabase as never, vendorId);
    const q = data.q.trim().toLowerCase();

    const residentById = new Map(scope.residents.map((r) => [r.id, r]));

    return scope.meters
      .filter((m) => {
        const resident = m.resident_id ? residentById.get(m.resident_id) : null;
        return [
          m.meter_number,
          m.serial_number,
          resident?.name ?? "",
          resident?.phone ?? "",
          resident?.email ?? "",
        ]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q));
      })
      .slice(0, 25)
      .map((m) => {
        const resident = m.resident_id ? residentById.get(m.resident_id) : null;
        return {
          id: m.id,
          meter_number: m.meter_number,
          serial_number: m.serial_number,
          type: m.type,
          status: m.status,
          price_per_unit: Number(m.price_per_unit ?? 0),
          unit_label: m.unit_label,
          property_name: m.property_name,
          zone_name: m.zone_name,
          vending_software_name: m.vending_software_name ?? null,
          customer_id: resident?.id ?? null,
          customer_name: resident?.name ?? null,
          customer_phone: resident?.phone ?? null,
        } satisfies VendorPosMeter;
      });
  });

/** Recent counter sales for the vendor's meters, optionally one meter. */
export const listVendorPosTokens = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ meter_id: uuid.nullable().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }): Promise<VendorPosToken[]> => {
    const { assertVendor } = await import("@/lib/vendor.server");
    const vendorId = await assertVendor(context as never);
    const supabase = context.supabase as any;

    const meterIds = await vendorMeterIds(supabase, vendorId);
    if (!meterIds.length) return [];
    if (data.meter_id && !meterIds.includes(data.meter_id)) throw new Error("Meter not found");

    const { data: rows, error } = await supabase
      .from("meter_tokens")
      .select("*")
      .in("meter_id", data.meter_id ? [data.meter_id] : meterIds)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return serialize(supabase, (rows ?? []) as any[]);
  });

/** Take payment at the counter and vend a credit token for a vendor meter. */
export const sellVendorPosToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        meter_id: uuid,
        units: z.number().positive("Units must be greater than zero"),
        amount: z.number().positive("Enter an amount greater than zero").max(10_000_000),
        method: z.enum(VENDOR_POS_METHODS),
        reference: z.string().trim().max(120).optional().nullable(),
        customer_phone: z.string().trim().max(30).optional().nullable(),
        sms_requested: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<VendorPosToken> => {
    const { assertVendor, logVendorAction, notify } = await import("@/lib/vendor.server");
    const vendorId = await assertVendor(context as never);
    const supabase = context.supabase as any;

    const { data: meter, error: meterErr } = await supabase
      .from("meters")
      .select("id, meter_number, status, vendor_id, unit_id")
      .eq("id", data.meter_id)
      .maybeSingle();
    if (meterErr) throw new Error(meterErr.message);
    if (!meter || (meter as any).vendor_id !== vendorId) throw new Error("Meter not found");
    if ((meter as any).status !== "active")
      throw new Error("This meter is not active — activate it before selling units");
    if (data.method !== "cash" && (data.reference ?? "").trim().length < 4)
      throw new Error("A payment reference is required for non-cash payments");
    if (data.sms_requested && (data.customer_phone ?? "").trim().length < 7)
      throw new Error("Enter a valid phone number for SMS delivery");

    const reference = `${data.method.toUpperCase()}${data.reference?.trim() ? ` ${data.reference.trim()}` : ""}`;

    const { data: row, error } = await supabase
      .from("meter_tokens")
      .insert({
        meter_id: data.meter_id,
        action: "credit",
        token: generateTokenValue(),
        units: data.units,
        amount: data.amount,
        reference,
        customer_phone: data.customer_phone?.trim() || null,
        sms_requested: data.sms_requested,
        expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
        issued_by: vendorId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    // Record the counter payment against the resident occupying the meter's unit.
    let residentId: string | null = null;
    if ((meter as any).unit_id) {
      const { data: assignment } = await supabase
        .from("unit_assignments")
        .select("user_id, end_date, role")
        .eq("unit_id", (meter as any).unit_id)
        .is("end_date", null)
        .eq("role", "resident")
        .maybeSingle();
      residentId = (assignment as any)?.user_id ?? null;
    }
    if (residentId) {
      await supabase.from("payments").insert({
        payee_type: "resident",
        payee_id: residentId,
        amount: data.amount,
        currency: "KES",
        status: "completed",
        reference,
        description: `Counter sale for meter ${(meter as any).meter_number}`,
        paid_at: new Date().toISOString(),
        created_by: vendorId,
      });
      await notify(
        supabase,
        residentId,
        "token_issued",
        "Prepaid token issued",
        `A token worth ${data.amount} was sold for meter ${(meter as any).meter_number}.`,
      );
    }

    await logVendorAction(
      supabase,
      vendorId,
      "VENDOR_TOKEN_REQUESTED",
      { type: "pos_sale", id: data.meter_id },
      { amount: data.amount, units: data.units, method: data.method },
    );

    const [serialized] = await serialize(supabase, [row]);
    return serialized!;
  });

/** SMS delivery attempts for the given vendor sales. */
export const listVendorPosSmsLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ token_ids: z.array(uuid).max(100) }).parse(d))
  .handler(async ({ data, context }): Promise<VendorPosSmsLog[]> => {
    const { assertVendor } = await import("@/lib/vendor.server");
    await assertVendor(context as never);
    const supabase = context.supabase as any;
    if (!data.token_ids.length) return [];

    const { data: rows, error } = await supabase
      .from("token_sms_logs")
      .select("*")
      .in("token_id", data.token_ids)
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);

    const actorIds = [...new Set(((rows ?? []) as any[]).map((r) => r.actor_id).filter(Boolean))] as string[];
    const actorById = new Map<string, string>();
    if (actorIds.length) {
      const { data: users } = await supabase.from("users").select("id, name, email").in("id", actorIds);
      for (const u of (users ?? []) as any[]) actorById.set(u.id, u.name ?? u.email ?? u.id);
    }

    return ((rows ?? []) as any[]).map((r) => ({
      id: r.id,
      token_id: r.token_id,
      phone: r.phone,
      status: r.status,
      error: r.error ?? null,
      actor_name: r.actor_id ? (actorById.get(r.actor_id) ?? null) : null,
      created_at: r.created_at,
    }));
  });

/** Queue an existing receipt for SMS delivery. The sale itself never changes. */
async function resendOne(
  supabase: any,
  vendorId: string,
  meterIds: string[],
  id: string,
  requestedPhone?: string | null,
): Promise<{ id: string; status: "queued" | "failed"; phone: string; error: string | null; row: any | null }> {
  const { data: existing } = await supabase.from("meter_tokens").select("*").eq("id", id).maybeSingle();
  const phone = (requestedPhone ?? (existing as any)?.customer_phone ?? "").trim();

  const fail = async (message: string) => {
    if (existing)
      await supabase.from("token_sms_logs").insert({
        token_id: id,
        phone: phone || "—",
        status: "failed",
        error: message,
        actor_id: vendorId,
      });
    return { id, status: "failed" as const, phone, error: message, row: null };
  };

  if (!existing || !meterIds.includes((existing as any).meter_id))
    return { id, status: "failed", phone, error: "Sale not found", row: null };
  if ((existing as any).status === "revoked")
    return await fail("This token has been revoked — the receipt cannot be re-sent");
  if (new Date((existing as any).expires_at).getTime() < Date.now())
    return await fail("This token has expired — sell a new token instead");
  if (phone.length < 7) return await fail("No valid phone number on file for this sale");

  const { data: row, error } = await supabase
    .from("meter_tokens")
    .update({ customer_phone: phone, sms_requested: true })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return await fail(error.message);

  await supabase
    .from("token_sms_logs")
    .insert({ token_id: id, phone, status: "queued", error: null, actor_id: vendorId });
  return { id, status: "queued", phone, error: null, row };
}

export const resendVendorPosSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: uuid, customer_phone: z.string().trim().max(30).optional().nullable() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<VendorPosToken> => {
    const { assertVendor } = await import("@/lib/vendor.server");
    const vendorId = await assertVendor(context as never);
    const supabase = context.supabase as any;
    const meterIds = await vendorMeterIds(supabase, vendorId);

    const result = await resendOne(supabase, vendorId, meterIds, data.id, data.customer_phone ?? null);
    if (result.status === "failed" || !result.row) throw new Error(result.error ?? "Failed to send SMS");
    const [serialized] = await serialize(supabase, [result.row]);
    return serialized!;
  });

export const bulkResendVendorPosSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ids: z.array(uuid).min(1).max(100) }).parse(d))
  .handler(async ({ data, context }) => {
    const { assertVendor } = await import("@/lib/vendor.server");
    const vendorId = await assertVendor(context as never);
    const supabase = context.supabase as any;
    const meterIds = await vendorMeterIds(supabase, vendorId);

    const results: { id: string; phone: string; status: "queued" | "failed"; error: string | null }[] = [];
    for (const id of data.ids) {
      const r = await resendOne(supabase, vendorId, meterIds, id);
      results.push({ id: r.id, phone: r.phone, status: r.status, error: r.error });
    }
    return {
      queued: results.filter((r) => r.status === "queued").length,
      failed: results.filter((r) => r.status === "failed").length,
      results,
    };
  });

/** Counter sales in a date range, for the vendor's shift report. */
export const listVendorPosSales = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ from: z.string().min(10), to: z.string().min(10) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<VendorPosToken[]> => {
    const { assertVendor } = await import("@/lib/vendor.server");
    const vendorId = await assertVendor(context as never);
    const supabase = context.supabase as any;

    const meterIds = await vendorMeterIds(supabase, vendorId);
    if (!meterIds.length) return [];

    const from = new Date(`${data.from}T00:00:00`).toISOString();
    const to = new Date(`${data.to}T23:59:59.999`).toISOString();

    const { data: rows, error } = await supabase
      .from("meter_tokens")
      .select("*")
      .eq("action", "credit")
      .in("meter_id", meterIds)
      .gte("created_at", from)
      .lte("created_at", to)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);
    return serialize(supabase, (rows ?? []) as any[]);
  });
