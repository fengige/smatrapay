import { commissionFromRow, type CommissionInfo } from "@/lib/commission";
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
  owner_type: "vendor" | "landlord" | "agent" | null;
  owner_id: string | null;
  supplier_name: string | null;
  owner_email: string | null;
  owner_phone: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  vending_software_name: string | null;
};

/**
 * Look a meter up by meter number, serial number, or the phone/name of the
 * resident occupying its unit. Returns owner (landlord) and customer
 * (resident) details for the token action panel.
 */
export const searchTokenMeters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ q: z.string().trim().min(2, "Enter at least 2 characters"), owner_type: z.enum(["all", "vendor", "landlord", "agent"]).optional().default("all") }).parse(d),
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
      .limit(50);

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
        "id, meter_number, serial_number, type, status, price_per_unit, sgc, krn, ti, ea, ken, unit_id, landlord_id, agent_id, vendor_id, supplier_id, vending_software_id",
      )
      .limit(25);

    const filters = [`meter_number.ilike.%${data.q}%`, `serial_number.ilike.%${data.q}%`];
    if (unitIdsFromPeople.length) filters.push(`unit_id.in.(${unitIdsFromPeople.join(",")})`);
    // Owner-name search: meters whose landlord, agent or vendor matches.
    if (personIds.length) {
      const ids = personIds.join(",");
      filters.push(`landlord_id.in.(${ids})`, `agent_id.in.(${ids})`, `vendor_id.in.(${ids})`);
    }
    query = query.or(filters.join(","));
    if (data.owner_type === "landlord") query = query.not("landlord_id", "is", null);
    else if (data.owner_type === "agent") query = query.is("landlord_id", null).not("agent_id", "is", null);
    else if (data.owner_type === "vendor") query = query.is("landlord_id", null).is("agent_id", null).not("vendor_id", "is", null);

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

    const { resolveMeterOwner } = await import("@/lib/sms-receipt.server");
    const ownerOf = new Map(rows.map((m) => [m.id, resolveMeterOwner(m)]));
    const landlordIds = [...new Set([...ownerOf.values()].map((o) => o?.id).filter(Boolean))] as string[];
    const supplierIds = [...new Set(rows.map((m) => m.supplier_id).filter(Boolean))] as string[];
    const supplierById = new Map<string, string>();
    if (supplierIds.length) {
      const { data: sup } = await supabase.from("meter_suppliers").select("id, company_name").in("id", supplierIds);
      for (const x of (sup ?? []) as any[]) supplierById.set(x.id, x.company_name);
    }
    const landlordById = new Map<string, any>();
    if (landlordIds.length) {
      const { data: landlords } = await supabase
        .from("users")
        .select("id, name, email, phone")
        .in("id", landlordIds);
      for (const l of (landlords ?? []) as any[]) landlordById.set(l.id, l);
    }

    const vsIds = [...new Set(rows.map((m) => m.vending_software_id).filter(Boolean))] as string[];
    const vsById = new Map<string, string>();
    if (vsIds.length) {
      const { data: vs } = await supabase
        .from("vending_software")
        .select("vending_software_id, name")
        .in("vending_software_id", vsIds);
      for (const v of (vs ?? []) as any[]) vsById.set(v.vending_software_id, v.name);
    }

    return rows.map((m) => {
      const unit = m.unit_id ? unitById.get(m.unit_id) : null;
      const property = unit ? propertyById.get(unit.property_id) : null;
      const resident = m.unit_id ? residentByUnit.get(m.unit_id) : null;
      const o = ownerOf.get(m.id);
      const owner = o ? landlordById.get(o.id) : null;
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
        owner_name: o ? (owner?.name ?? owner?.email ?? null) : null,
        owner_type: o?.type ?? null,
        owner_id: o?.id ?? null,
        supplier_name: m.supplier_id ? (supplierById.get(m.supplier_id) ?? null) : null,
        owner_email: owner?.email ?? null,
        owner_phone: owner?.phone ?? null,
        customer_name: resident?.name ?? null,
        customer_email: resident?.email ?? null,
        customer_phone: resident?.phone ?? null,
        vending_software_name: m.vending_software_id
          ? (vsById.get(m.vending_software_id) ?? null)
          : null,
      } satisfies TokenMeterMatch;
    });
  });

/* ------------------------------------------------------------------ *
 * Token issuance, listing and revocation
 * ------------------------------------------------------------------ */

export type TokenAction =
  | "credit"
  | "key_change"
  | "set_max_overdraft"
  | "clear_tamper"
  | "clear_credit";

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
  issued_by_role: TokenIssuerRole;
  vending_software_name: string | null;
  provider: string | null;
  provider_reference: string | null;
  /** Commission/VAT deducted from the payment; null on older or non-credit tokens. */
  commission: CommissionInfo | null;
  created_at: string;
  /** Present when a receipt SMS was attempted in this request. */
  sms?: import("@/lib/sms-receipt.server").ReceiptSmsResult;
};

export type TokenIssuerRole = "admin" | "vendor" | "other" | "unknown";

const tokenAction = z.enum([
  "credit",
  "key_change",
  "set_max_overdraft",
  "clear_tamper",
  "clear_credit",
]);

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
  const meterById = new Map<string, string>(
    (meters ?? []).map((m: any) => [m.id as string, m.meter_number as string]),
  );

  const softwareIds = [
    ...new Set(rows.map((r) => r.vending_software_id).filter(Boolean)),
  ] as string[];
  const softwareById = new Map<string, string>();
  if (softwareIds.length) {
    const { data: software } = await supabase
      .from("vending_software")
      .select("vending_software_id, name")
      .in("vending_software_id", softwareIds);
    for (const s of (software ?? []) as any[])
      softwareById.set(s.vending_software_id as string, s.name as string);
  }

  const actorIds = [...new Set(rows.map((r) => r.issued_by).filter(Boolean))] as string[];
  const actorById = new Map<string, string>();
  const roleById = new Map<string, TokenIssuerRole>();
  if (actorIds.length) {
    const [{ data: users }, { data: roles }] = await Promise.all([
      supabase.from("users").select("id, name, email").in("id", actorIds),
      supabase.from("user_roles").select("user_id, role").in("user_id", actorIds),
    ]);
    for (const u of (users ?? []) as any[]) actorById.set(u.id, u.name ?? u.email ?? u.id);
    for (const r of (roles ?? []) as any[]) {
      const current = roleById.get(r.user_id as string);
      if (r.role === "admin") roleById.set(r.user_id as string, "admin");
      else if (r.role === "vendor" && current !== "admin") roleById.set(r.user_id as string, "vendor");
      else if (!current) roleById.set(r.user_id as string, "other");
    }
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
    issued_by_role: (r.issued_by ? (roleById.get(r.issued_by) ?? "other") : "unknown") as TokenIssuerRole,
    vending_software_name: r.vending_software_id
      ? (softwareById.get(r.vending_software_id) ?? null)
      : null,
    provider: r.provider ?? null,
    provider_reference: r.provider_reference ?? null,
    commission: commissionFromRow(r),
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
        /** True when the customer buys units instead of value. */
        vend_by_unit: z.boolean().optional().default(false),
        /** One-time id from the form; replays return the same token. */
        request_id: z.string().trim().max(100).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<IssuedToken> => {
    await assertAdmin(context as never);
    const { supabase } = context;

    if (data.action === "credit" && data.amount <= 0)
      throw new Error("Enter an amount greater than zero");
    if (data.action === "set_max_overdraft" && data.units <= 0)
      throw new Error("Enter a max overdraft limit greater than zero");
    if (data.sms_requested && (data.customer_phone ?? "").trim().length < 7)
      throw new Error("Enter a valid phone number for SMS delivery");

    // The vending software assigned to the meter decides how the token is
    // generated; the client never supplies it.
    const { vendMeterToken } = await import("@/lib/vending/vend.server");
    const { row } = await vendMeterToken(supabase, {
      meterId: data.meter_id,
      action: data.action,
      units: data.units,
      amount: data.amount,
      vendByUnit: data.vend_by_unit,
      reference: data.reference ?? null,
      customerPhone: data.customer_phone ?? null,
      smsRequested: data.sms_requested,
      expiresInDays: data.expires_in_days,
      actorId: context.userId,
      requestId: data.request_id ?? null,
    });

    const [serialized] = await serialize(supabase, [row]);
    if (data.sms_requested && data.customer_phone && serialized) {
      // SMS failures never undo the completed token transaction.
      const { sendTokenReceiptSms } = await import("@/lib/sms-receipt.server");
      try {
        serialized.sms = await sendTokenReceiptSms(supabase, {
          tokenId: serialized.id, phone: data.customer_phone, actorId: context.userId,
        });
      } catch (e) {
        serialized.sms = { status: "failed", message: (e as Error).message, provider: null, provider_message_id: null, owner_type: null, owner_name: null };
      }
    }
    return serialized!;
  });

/** Recent tokens, optionally scoped to one meter. */
export const listMeterTokens = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        meter_id: z.string().uuid().optional().nullable(),
        source: z.enum(["all", "admin", "vendor"]).optional(),
      })
      .parse(d ?? {}),
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
    const serialized = await serialize(supabase, (rows ?? []) as any[]);
    const source = data.source ?? "all";
    return source === "all" ? serialized : serialized.filter((t) => t.issued_by_role === source);
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

/* ------------------------------------------------------------------ *
 * SMS receipt re-send + delivery audit trail
 * ------------------------------------------------------------------ */

export type SmsDeliveryStatus = "queued" | "sent" | "failed";

export type TokenSmsLog = {
  id: string;
  token_id: string;
  phone: string;
  status: SmsDeliveryStatus;
  error: string | null;
  actor_id: string | null;
  actor_name: string | null;
  created_at: string;
};

async function logSmsAttempt(
  supabase: any,
  entry: {
    token_id: string;
    phone: string;
    status: SmsDeliveryStatus;
    error?: string | null;
    actor_id: string | null;
  },
) {
  await supabase.from("token_sms_logs").insert({
    token_id: entry.token_id,
    phone: entry.phone,
    status: entry.status,
    error: entry.error ?? null,
    actor_id: entry.actor_id,
  } as never);
}

/** Attempt one re-send; records an audit entry for the attempt either way. */
async function resendOne(
  supabase: any,
  actorId: string | null,
  id: string,
  requestedPhone?: string | null,
): Promise<{ id: string; status: SmsDeliveryStatus; phone: string; error: string | null; row: any | null }> {
  const { data: existing, error: readErr } = await supabase
    .from("meter_tokens")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const phone = (requestedPhone ?? (existing as any)?.customer_phone ?? "").trim();

  const fail = async (message: string) => {
    if (existing) await logSmsAttempt(supabase, { token_id: id, phone: phone || "—", status: "failed", error: message, actor_id: actorId });
    return { id, status: "failed" as const, phone, error: message, row: null };
  };

  if (readErr) return { id, status: "failed", phone, error: readErr.message, row: null };
  if (!existing) return { id, status: "failed", phone, error: "Token not found", row: null };
  if ((existing as any).status === "revoked")
    return await fail("This token has been revoked — the receipt cannot be re-sent");
  if (new Date((existing as any).expires_at).getTime() < Date.now())
    return await fail("This token has expired — issue a new token instead");
  if (phone.length < 7) return await fail("No valid phone number on file for this sale");

  const { sendTokenReceiptSms } = await import("@/lib/sms-receipt.server");
  const sms = await sendTokenReceiptSms(supabase, { tokenId: id, phone, actorId });
  if (sms.status === "failed") return { id, status: "failed", phone, error: sms.message, row: null };
  const { data: row } = await supabase.from("meter_tokens").select("*").eq("id", id).single();
  return { id, status: "sent", phone, error: null, row };
}

/** Re-send the receipt for an existing token via SMS without recreating the sale. */
export const resendTokenSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        customer_phone: z.string().trim().max(30).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<IssuedToken> => {
    await assertAdmin(context as never);
    const { supabase, userId } = context as any;

    const result = await resendOne(supabase, userId ?? null, data.id, data.customer_phone ?? null);
    if (result.status === "failed" || !result.row) throw new Error(result.error ?? "Failed to send SMS");

    const [serialized] = await serialize(supabase, [result.row]);
    return serialized!;
  });

/** Re-send receipts for several sales at once. */
export const bulkResendTokenSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(100) }).parse(d),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      queued: number;
      failed: number;
      results: { id: string; meter_number: string; phone: string; status: SmsDeliveryStatus; error: string | null }[];
    }> => {
      await assertAdmin(context as never);
      const { supabase, userId } = context as any;

      const results: {
        id: string;
        meter_number: string;
        phone: string;
        status: SmsDeliveryStatus;
        error: string | null;
      }[] = [];

      const rows: any[] = [];
      for (const id of data.ids) {
        const r = await resendOne(supabase, userId ?? null, id);
        if (r.row) rows.push(r.row);
        results.push({ id: r.id, meter_number: "—", phone: r.phone, status: r.status, error: r.error });
      }

      // Attach meter numbers for a readable summary.
      const { data: tokens } = await supabase
        .from("meter_tokens")
        .select("id, meter_id")
        .in("id", data.ids);
      const meterIds = [...new Set((tokens ?? []).map((t: any) => t.meter_id))];
      if (meterIds.length) {
        const { data: meters } = await supabase.from("meters").select("id, meter_number").in("id", meterIds);
        const meterById = new Map((meters ?? []).map((m: any) => [m.id, m.meter_number]));
        const numberByToken = new Map(
          (tokens ?? []).map((t: any) => [t.id, meterById.get(t.meter_id) ?? "—"]),
        );
        for (const r of results) r.meter_number = (numberByToken.get(r.id) as string) ?? "—";
      }

      return {
        queued: results.filter((r) => r.status !== "failed").length,
        failed: results.filter((r) => r.status === "failed").length,
        results,
      };
    },
  );

/** SMS delivery attempts for the given tokens, newest first. */
export const listTokenSmsLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ token_ids: z.array(z.string().uuid()).max(200) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<TokenSmsLog[]> => {
    const { supabase } = context;
    if (!data.token_ids.length) return [];

    const { data: rows, error } = await supabase
      .from("token_sms_logs")
      .select("*")
      .in("token_id", data.token_ids)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const actorIds = [...new Set((rows ?? []).map((r: any) => r.actor_id).filter(Boolean))] as string[];
    const actorById = new Map<string, string>();
    if (actorIds.length) {
      const { data: users } = await supabase.from("users").select("id, name, email").in("id", actorIds);
      for (const u of (users ?? []) as any[]) actorById.set(u.id, u.name ?? u.email ?? u.id);
    }

    return (rows ?? []).map((r: any) => ({
      id: r.id,
      token_id: r.token_id,
      phone: r.phone,
      status: r.status,
      error: r.error ?? null,
      actor_id: r.actor_id ?? null,
      actor_name: r.actor_id ? (actorById.get(r.actor_id) ?? null) : null,
      created_at: r.created_at,
    }));
  });

