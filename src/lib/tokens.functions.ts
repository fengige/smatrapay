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

export type TokenMeterMatch = {
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
  owner_name: string | null;
  owner_email: string | null;
  owner_phone: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
};

/**
 * Look a meter up by meter number, serial number, or the phone/name of the
 * resident occupying its unit. Returns owner (landlord) and customer
 * (resident) details for the token action panel.
 */
export const searchTokenMeters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ q: z.string().trim().min(2, "Enter at least 2 characters") }).parse(d),
  )
  .handler(async ({ data, context }): Promise<TokenMeterMatch[]> => {
    await assertAdmin(context as never);
    const { supabase } = context;
    const q = data.q.toLowerCase();

    // Residents matching the query, so a phone/name search finds their meters.
    const { data: people } = await supabase
      .from("users")
      .select("id, name, email, phone")
      .or(`name.ilike.%${data.q}%,phone.ilike.%${data.q}%,email.ilike.%${data.q}%`)
      .limit(25);

    const personIds = (people ?? []).map((p: any) => p.id as string);
    let unitIdsFromPeople: string[] = [];
    if (personIds.length) {
      const { data: assignments } = await supabase
        .from("unit_assignments")
        .select("unit_id, user_id, end_date")
        .in("user_id", personIds);
      unitIdsFromPeople = (assignments ?? [])
        .filter((a: any) => !a.end_date)
        .map((a: any) => a.unit_id as string);
    }

    let query = supabase
      .from("meters")
      .select(
        "id, meter_number, serial_number, type, status, price_per_unit, sgc, krn, ti, ea, ken, unit_id, landlord_id",
      )
      .limit(25);

    const filters = [`meter_number.ilike.%${data.q}%`, `serial_number.ilike.%${data.q}%`];
    if (unitIdsFromPeople.length) filters.push(`unit_id.in.(${unitIdsFromPeople.join(",")})`);
    query = query.or(filters.join(","));

    const { data: meters, error } = await query;
    if (error) throw new Error(error.message);
    const rows = (meters ?? []) as any[];
    if (!rows.length) return [];

    const unitIds = [...new Set(rows.map((m) => m.unit_id).filter(Boolean))] as string[];
    const unitById = new Map<string, any>();
    const propertyById = new Map<string, any>();
    const residentByUnit = new Map<string, any>();

    if (unitIds.length) {
      const { data: units } = await supabase
        .from("units")
        .select("id, unit_number, property_id")
        .in("id", unitIds);
      for (const u of (units ?? []) as any[]) unitById.set(u.id, u);

      const propIds = [...new Set([...unitById.values()].map((u) => u.property_id))] as string[];
      if (propIds.length) {
        const { data: props } = await supabase
          .from("properties")
          .select("id, name")
          .in("id", propIds);
        for (const p of (props ?? []) as any[]) propertyById.set(p.id, p);
      }

      const { data: assignments } = await supabase
        .from("unit_assignments")
        .select("unit_id, user_id, end_date, role")
        .in("unit_id", unitIds);
      const residentIds = [
        ...new Set(
          (assignments ?? [])
            .filter((a: any) => !a.end_date && a.role === "resident")
            .map((a: any) => a.user_id as string),
        ),
      ];
      if (residentIds.length) {
        const { data: residents } = await supabase
          .from("users")
          .select("id, name, email, phone")
          .in("id", residentIds);
        const byId = new Map((residents ?? []).map((r: any) => [r.id, r]));
        for (const a of (assignments ?? []) as any[]) {
          if (a.end_date || a.role !== "resident") continue;
          const r = byId.get(a.user_id);
          if (r) residentByUnit.set(a.unit_id, r);
        }
      }
    }

    const landlordIds = [...new Set(rows.map((m) => m.landlord_id).filter(Boolean))] as string[];
    const landlordById = new Map<string, any>();
    if (landlordIds.length) {
      const { data: landlords } = await supabase
        .from("users")
        .select("id, name, email, phone")
        .in("id", landlordIds);
      for (const l of (landlords ?? []) as any[]) landlordById.set(l.id, l);
    }

    return rows.map((m) => {
      const unit = m.unit_id ? unitById.get(m.unit_id) : null;
      const property = unit ? propertyById.get(unit.property_id) : null;
      const resident = m.unit_id ? residentByUnit.get(m.unit_id) : null;
      const owner = m.landlord_id ? landlordById.get(m.landlord_id) : null;
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
        unit_label: unit ? `Unit ${unit.unit_number}` : null,
        property_name: property?.name ?? null,
        owner_name: owner?.name ?? null,
        owner_email: owner?.email ?? null,
        owner_phone: owner?.phone ?? null,
        customer_name: resident?.name ?? null,
        customer_email: resident?.email ?? null,
        customer_phone: resident?.phone ?? null,
      } satisfies TokenMeterMatch;
    });
  });

/* ------------------------------------------------------------------ *
 * Token issuance, listing and revocation
 * ------------------------------------------------------------------ */

export type TokenAction = "credit" | "key_change" | "clear_tamper" | "clear_credit";

export type IssuedToken = {
  id: string;
  meter_id: string;
  meter_number: string;
  action: TokenAction;
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

const tokenAction = z.enum(["credit", "key_change", "clear_tamper", "clear_credit"]);

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

async function serialize(supabase: any, rows: any[]): Promise<IssuedToken[]> {
  if (!rows.length) return [];
  const meterIds = [...new Set(rows.map((r) => r.meter_id))];
  const { data: meters } = await supabase
    .from("meters")
    .select("id, meter_number")
    .in("id", meterIds);
  const meterById = new Map((meters ?? []).map((m: any) => [m.id, m.meter_number as string]));

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
    action: r.action as TokenAction,
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

/** Issue a token for a meter and persist it with an expiry window. */
export const issueMeterToken = createServerFn({ method: "POST" })
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
  .handler(async ({ data, context }): Promise<IssuedToken> => {
    await assertAdmin(context as never);
    const { supabase } = context;

    const { data: meter, error: meterErr } = await supabase
      .from("meters")
      .select("id, status")
      .eq("id", data.meter_id)
      .maybeSingle();
    if (meterErr) throw new Error(meterErr.message);
    if (!meter) throw new Error("Meter not found");
    if ((meter as any).status !== "active")
      throw new Error("This meter is not active — activate it before issuing tokens");
    if (data.action === "credit" && data.amount <= 0)
      throw new Error("Enter an amount greater than zero");
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

    const [serialized] = await serialize(supabase, [row]);
    return serialized!;
  });

/** Recent tokens, optionally scoped to one meter. */
export const listMeterTokens = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ meter_id: z.string().uuid().optional().nullable() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<IssuedToken[]> => {
    await assertAdmin(context as never);
    const { supabase } = context;
    let query = supabase
      .from("meter_tokens")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data.meter_id) query = query.eq("meter_id", data.meter_id);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return serialize(supabase, (rows ?? []) as any[]);
  });

/** Revoke a previously issued token so it can no longer be used. */
export const revokeMeterToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        reason: z.string().trim().max(200).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<IssuedToken> => {
    await assertAdmin(context as never);
    const { supabase } = context;

    const { data: existing, error: readErr } = await supabase
      .from("meter_tokens")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!existing) throw new Error("Token not found");
    if ((existing as any).status === "revoked") throw new Error("This token is already revoked");

    const { data: row, error } = await supabase
      .from("meter_tokens")
      .update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
        revoked_by: context.userId,
        revoke_reason: data.reason?.trim() || null,
      } as never)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    const [serialized] = await serialize(supabase, [row]);
    return serialized!;
  });
