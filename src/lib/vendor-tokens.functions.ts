import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type VendorTokenAction =
  | "credit"
  | "set_max_overdraft"
  | "clear_tamper"
  | "clear_credit";

export type VendorTokenMeterMatch = {
  id: string;
  meter_number: string;
  serial_number: string;
  type: string;
  status: string;
  price_per_unit: number;
  sgc: number | null;
  krn: number | null;
  ti: number | null;
  ea: number | null;
  ken: number | null;
  unit_label: string | null;
  property_name: string | null;
  zone_name: string | null;
  vending_software_name: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
};

export type VendorIssuedToken = {
  id: string;
  meter_id: string;
  meter_number: string;
  action: VendorTokenAction;
  token: string;
  units: number;
  amount: number;
  reference: string | null;
  customer_phone: string | null;
  sms_requested: boolean;
  status: "issued" | "revoked" | "expired";
  expires_at: string;
  revoked_at: string | null;
  revoke_reason: string | null;
  issued_by_name: string | null;
  created_at: string;
};

const tokenAction = z.enum(["credit", "set_max_overdraft", "clear_tamper", "clear_credit"]);

/** 20-digit STS-style token, formatted in groups of four. */
function generateTokenValue() {
  let out = "";
  for (let i = 0; i < 20; i += 1) out += Math.floor(Math.random() * 10);
  return out.replace(/(\d{4})(?=\d)/g, "$1-");
}

function effectiveStatus(row: any): "issued" | "revoked" | "expired" {
  if (row.status === "issued" && new Date(row.expires_at).getTime() < Date.now()) return "expired";
  return row.status;
}

async function vendorMeterIds(supabase: any, vendorId: string): Promise<string[]> {
  const { data } = await supabase.from("meters").select("id").eq("vendor_id", vendorId);
  return (data ?? []).map((m: any) => m.id as string);
}

async function serialize(supabase: any, rows: any[]): Promise<VendorIssuedToken[]> {
  if (!rows.length) return [];
  const meterIds = [...new Set(rows.map((r) => r.meter_id))];
  const { data: meters } = await supabase
    .from("meters")
    .select("id, meter_number")
    .in("id", meterIds);
  const meterById = new Map<string, string>(
    (meters ?? []).map((m: any) => [m.id as string, m.meter_number as string]),
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
    action: r.action as VendorTokenAction,
    token: r.token,
    units: Number(r.units ?? 0),
    amount: Number(r.amount ?? 0),
    reference: r.reference ?? null,
    customer_phone: r.customer_phone ?? null,
    sms_requested: !!r.sms_requested,
    status: effectiveStatus(r),
    expires_at: r.expires_at,
    revoked_at: r.revoked_at ?? null,
    revoke_reason: r.revoke_reason ?? null,
    issued_by_name: r.issued_by ? (actorById.get(r.issued_by) ?? null) : null,
    created_at: r.created_at,
  }));
}

/** Search only the signed-in vendor's own meters. */
export const searchVendorTokenMeters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ q: z.string().trim().min(2, "Enter at least 2 characters") }).parse(d),
  )
  .handler(async ({ data, context }): Promise<VendorTokenMeterMatch[]> => {
    const { assertVendor, loadVendorScope } = await import("@/lib/vendor.server");
    const vendorId = await assertVendor(context as never);
    const scope = await loadVendorScope(context.supabase as never, vendorId);
    const q = data.q.trim().toLowerCase();
    const residentById = new Map(scope.residents.map((r) => [r.id, r]));

    return scope.meters
      .filter((m) => {
        const resident = m.resident_id ? residentById.get(m.resident_id) : null;
        return [m.meter_number, m.serial_number, resident?.name, resident?.phone, resident?.email]
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
          sgc: m.sgc,
          krn: m.krn,
          ti: m.ti,
          ea: m.ea,
          ken: m.ken,
          unit_label: m.unit_label,
          property_name: m.property_name,
          zone_name: m.zone_name,
          vending_software_name: m.vending_software_name ?? null,
          customer_id: resident?.id ?? null,
          customer_name: resident?.name ?? null,
          customer_phone: resident?.phone ?? null,
        } satisfies VendorTokenMeterMatch;
      });
  });

/** Issue a token against one of the vendor's own meters. */
export const issueVendorMeterToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        meter_id: z.string().uuid(),
        action: tokenAction,
        units: z.number().nonnegative().default(0),
        amount: z.number().nonnegative().default(0),
        reference: z.string().trim().max(120).optional().nullable(),
        customer_phone: z.string().trim().max(30).optional().nullable(),
        sms_requested: z.boolean().default(false),
        expires_in_days: z.number().int().min(1).max(365).default(30),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<VendorIssuedToken> => {
    const { assertVendor, logVendorAction } = await import("@/lib/vendor.server");
    const vendorId = await assertVendor(context as never);
    const supabase = context.supabase as any;

    const { data: meter, error: meterErr } = await supabase
      .from("meters")
      .select("id, status, vendor_id")
      .eq("id", data.meter_id)
      .maybeSingle();
    if (meterErr) throw new Error(meterErr.message);
    if (!meter || (meter as any).vendor_id !== vendorId) throw new Error("Meter not found");
    if ((meter as any).status !== "active")
      throw new Error("This meter is not active — activate it before issuing tokens");
    if (data.action === "credit" && data.amount <= 0)
      throw new Error("Enter an amount greater than zero");
    if (data.action === "set_max_overdraft" && data.units <= 0)
      throw new Error("Enter a max overdraft limit greater than zero");
    if (data.sms_requested && (data.customer_phone ?? "").trim().length < 7)
      throw new Error("Enter a valid phone number for SMS delivery");

    const expires = new Date(Date.now() + data.expires_in_days * 86_400_000).toISOString();
    const { data: row, error } = await supabase
      .from("meter_tokens")
      .insert({
        meter_id: data.meter_id,
        action: data.action,
        token: generateTokenValue(),
        units: data.units,
        amount: data.amount,
        reference: data.reference?.trim() || null,
        customer_phone: data.customer_phone?.trim() || null,
        sms_requested: data.sms_requested,
        expires_at: expires,
        issued_by: context.userId,
      } as never)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await logVendorAction(
      supabase,
      vendorId,
      "VENDOR_TOKEN_REQUESTED",
      { type: "meter_token", id: (row as any).id },
      { meter_id: data.meter_id, action: data.action, amount: data.amount },
    );

    const [serialized] = await serialize(supabase, [row]);
    return serialized!;
  });

/** Recent tokens on the vendor's meters, optionally scoped to one meter. */
export const listVendorMeterTokens = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ meter_id: z.string().uuid().optional().nullable() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<VendorIssuedToken[]> => {
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
