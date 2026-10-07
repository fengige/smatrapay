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

export type PriceMode =
  | "set"
  | "increase_pct"
  | "decrease_pct"
  | "increase_amount"
  | "decrease_amount";

const priceInput = z.object({
  ids: z.array(uuid).min(1, "Select at least one meter").max(1000),
  mode: z.enum(["set", "increase_pct", "decrease_pct", "increase_amount", "decrease_amount"]),
  value: z.number().finite().min(0, "Value cannot be negative").max(1_000_000),
});

/** Round to 2 decimals like the meters.price_per_unit numeric(15,2) column. */
function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function applyPriceMode(current: number, mode: PriceMode, value: number) {
  switch (mode) {
    case "set":
      return round2(value);
    case "increase_pct":
      return round2(current * (1 + value / 100));
    case "decrease_pct":
      return round2(current * (1 - value / 100));
    case "increase_amount":
      return round2(current + value);
    case "decrease_amount":
      return round2(current - value);
  }
}

export type BulkPriceResult = {
  updated: number;
  unchanged: number;
  changes: { id: string; meter_number: string; from: number; to: number }[];
};

/** Apply a price-per-unit configuration to many meters at once. */
export const bulkSetMeterPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => priceInput.parse(data))
  .handler(async ({ data, context }): Promise<BulkPriceResult> => {
    await assertAdmin(context as never);
    const { supabase } = context;

    const { data: rows, error } = await supabase
      .from("meters")
      .select("id, meter_number, price_per_unit")
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    if (!rows?.length) throw new Error("No matching meters found");

    const changes: BulkPriceResult["changes"] = [];
    let unchanged = 0;

    for (const row of rows as any[]) {
      const from = Number(row.price_per_unit ?? 0);
      const next = applyPriceMode(from, data.mode, data.value);
      if (next < 0) throw new Error(`Meter ${row.meter_number} would get a negative price`);
      if (next === from) {
        unchanged += 1;
        continue;
      }
      changes.push({ id: row.id, meter_number: row.meter_number ?? "", from, to: next });
    }

    // Group updates by the resulting price so we issue one statement per value.
    const byPrice = new Map<number, string[]>();
    for (const c of changes) {
      const list = byPrice.get(c.to) ?? [];
      list.push(c.id);
      byPrice.set(c.to, list);
    }

    for (const [price, ids] of byPrice) {
      const { error: upErr } = await supabase
        .from("meters")
        .update({ price_per_unit: price } as never)
        .in("id", ids);
      if (upErr) throw new Error(upErr.message);
    }

    return { updated: changes.length, unchanged, changes };
  });

export type PriceAuditEntry = {
  id: string;
  created_at: string;
  actor_name: string | null;
  meters: { id: string; meter_number: string; from: number; to: number }[];
};

/**
 * Price-per-unit change history, grouped into batches.
 * Entries by the same actor within 10 seconds are treated as one bulk change.
 */
export const listPriceAuditLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PriceAuditEntry[]> => {
    await assertAdmin(context as never);
    const { supabase } = context;

    const { data: rows, error } = await supabase
      .from("meter_audit_logs")
      .select("id, meter_id, actor_id, changes, created_at")
      .not("changes->price_per_unit", "is", null)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const list = (rows ?? []) as any[];
    const meterIds = [...new Set(list.map((r) => r.meter_id).filter(Boolean))];
    const actorIds = [...new Set(list.map((r) => r.actor_id).filter(Boolean))];

    let meterRows: any[] = [];
    if (meterIds.length) {
      const { data: m } = await supabase
        .from("meters")
        .select("id, meter_number")
        .in("id", meterIds as string[]);
      meterRows = m ?? [];
    }
    const meterById = new Map(meterRows.map((m) => [m.id, m.meter_number as string]));

    let actorRows: any[] = [];
    if (actorIds.length) {
      const { data: a } = await supabase
        .from("users")
        .select("id, name, email")
        .in("id", actorIds as string[]);
      actorRows = a ?? [];
    }
    const actorById = new Map(actorRows.map((a) => [a.id, (a.name as string) || (a.email as string)]));

    const batches: PriceAuditEntry[] = [];
    for (const row of list) {
      const diff = (row.changes ?? {}).price_per_unit ?? {};
      const from = diff.old === null || diff.old === undefined ? 0 : Number(diff.old);
      const to = Number(diff.new ?? 0);
      const actorName = row.actor_id ? (actorById.get(row.actor_id) ?? null) : null;
      const at = new Date(row.created_at).getTime();

      const last = batches[batches.length - 1];
      const sameBatch =
        last &&
        last.actor_name === actorName &&
        Math.abs(new Date(last.created_at).getTime() - at) <= 10_000;

      const entry = {
        id: row.meter_id as string,
        meter_number: meterById.get(row.meter_id) ?? "Deleted meter",
        from,
        to,
      };

      if (sameBatch) last!.meters.push(entry);
      else
        batches.push({
          id: row.id as string,
          created_at: row.created_at as string,
          actor_name: actorName,
          meters: [entry],
        });
    }

    return batches.slice(0, 50);
  });

export type PriceChangeRequest = {
  id: string;
  created_at: string;
  reviewed_at: string | null;
  meter_id: string;
  meter_number: string;
  meter_type: string | null;
  vendor_id: string;
  vendor_name: string | null;
  current_price: number;
  requested_price: number;
  status: string;
  note: string | null;
  review_note: string | null;
};

/** Vendor-submitted price change requests awaiting (or past) admin review. */
export const listPriceChangeRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PriceChangeRequest[]> => {
    await assertAdmin(context as never);
    const { supabase } = context as any;

    const { data: rows, error } = await supabase
      .from("meter_price_change_requests")
      .select(
        "id, created_at, reviewed_at, meter_id, vendor_id, current_price, requested_price, status, note, review_note",
      )
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as any[];

    const meterIds = [...new Set(list.map((r) => r.meter_id))];
    const vendorIds = [...new Set(list.map((r) => r.vendor_id))];

    let meters: any[] = [];
    if (meterIds.length) {
      const { data } = await supabase.from("meters").select("id, meter_number, type").in("id", meterIds);
      meters = data ?? [];
    }
    let vendors: any[] = [];
    if (vendorIds.length) {
      const { data } = await supabase.from("users").select("id, name, email").in("id", vendorIds);
      vendors = data ?? [];
    }
    const meterById = new Map(meters.map((m) => [m.id as string, m]));
    const vendorById = new Map(vendors.map((v) => [v.id as string, v]));

    return list.map((r) => {
      const m = meterById.get(r.meter_id);
      const v = vendorById.get(r.vendor_id);
      return {
        id: r.id,
        created_at: r.created_at,
        reviewed_at: r.reviewed_at ?? null,
        meter_id: r.meter_id,
        meter_number: (m?.meter_number as string) ?? "Deleted meter",
        meter_type: (m?.type as string) ?? null,
        vendor_id: r.vendor_id,
        vendor_name: (v?.name as string) || (v?.email as string) || null,
        current_price: Number(r.current_price ?? 0),
        requested_price: Number(r.requested_price ?? 0),
        status: r.status,
        note: r.note ?? null,
        review_note: r.review_note ?? null,
      };
    });
  });

const reviewInput = z.object({
  ids: z.array(uuid).min(1).max(500),
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(500).optional().nullable(),
});

/** Approve or reject vendor price requests. Approval writes the new meter price. */
export const reviewPriceChangeRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => reviewInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabase, userId } = context as any;

    const { data: rows, error } = await supabase
      .from("meter_price_change_requests")
      .select("id, meter_id, requested_price, status")
      .in("id", data.ids)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as any[];
    if (!list.length) return { applied: 0, rejected: 0 };

    let applied = 0;
    if (data.decision === "approved") {
      const byPrice = new Map<number, string[]>();
      for (const r of list) {
        const price = Number(r.requested_price ?? 0);
        byPrice.set(price, [...(byPrice.get(price) ?? []), r.meter_id as string]);
      }
      for (const [price, meterIds] of byPrice) {
        const { error: upErr } = await supabase
          .from("meters")
          .update({ price_per_unit: price } as never)
          .in("id", meterIds);
        if (upErr) throw new Error(upErr.message);
        applied += meterIds.length;
      }
    }

    const { error: reviewErr } = await supabase
      .from("meter_price_change_requests")
      .update({
        status: data.decision,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        review_note: data.note ?? null,
      } as never)
      .in(
        "id",
        list.map((r) => r.id),
      );
    if (reviewErr) throw new Error(reviewErr.message);

    return { applied, rejected: data.decision === "rejected" ? list.length : 0 };
  });

/* ---------- Commission & VAT on Commission ---------- */

export const percentField = z
  .number({ message: "Enter a number" })
  .finite("Enter a number")
  .min(0, "Percentage cannot be negative")
  .max(100, "Percentage cannot be more than 100%");

export const commissionInput = z.object({
  commission_percentage: percentField,
  vat_on_commission_percentage: percentField,
});

export type CommissionSettings = {
  commission_percentage: number;
  vat_on_commission_percentage: number;
  updated_at: string | null;
  updated_by_name: string | null;
  history: {
    id: string;
    field: "commission_percentage" | "vat_on_commission_percentage";
    previous_value: number | null;
    new_value: number | null;
    changed_by_name: string | null;
    created_at: string;
  }[];
};

/** Commission split for downstream calculations: commission and the VAT charged on it. */
export function computeCommission(amount: number, commissionPct: number, vatPct: number) {
  const commission = round2((amount * commissionPct) / 100);
  const vat = round2((commission * vatPct) / 100);
  return { commission, vat_on_commission: vat, total: round2(commission + vat) };
}

export const getCommissionSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CommissionSettings> => {
    await assertAdmin(context as never);
    const supabase = context.supabase as any;
    const { data: row, error } = await supabase
      .from("pricing_settings")
      .select("commission_percentage, vat_on_commission_percentage, updated_at, updated_by")
      .maybeSingle();
    if (error) throw new Error(error.message);
    const { data: hist } = await supabase
      .from("pricing_settings_history")
      .select("id, field, previous_value, new_value, changed_by, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    const ids = [...new Set([row?.updated_by, ...(hist ?? []).map((h: any) => h.changed_by)].filter(Boolean))];
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: users } = await supabase.from("users").select("id, name, email").in("id", ids);
      for (const u of users ?? []) names.set(u.id, u.name || u.email);
    }
    return {
      commission_percentage: Number(row?.commission_percentage ?? 0),
      vat_on_commission_percentage: Number(row?.vat_on_commission_percentage ?? 0),
      updated_at: row?.updated_at ?? null,
      updated_by_name: row?.updated_by ? (names.get(row.updated_by) ?? null) : null,
      history: (hist ?? []).map((h: any) => ({
        id: h.id,
        field: h.field,
        previous_value: h.previous_value === null ? null : Number(h.previous_value),
        new_value: h.new_value === null ? null : Number(h.new_value),
        changed_by_name: h.changed_by ? (names.get(h.changed_by) ?? null) : null,
        created_at: h.created_at,
      })),
    };
  });

export const saveCommissionSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => commissionInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { error } = await (context.supabase as any)
      .from("pricing_settings")
      .upsert({
        id: true,
        commission_percentage: round2(data.commission_percentage),
        vat_on_commission_percentage: round2(data.vat_on_commission_percentage),
      });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Effective rates for a meter: its own values, else the default rates. */
export function effectiveCommissionRates(
  meter: { commission_percentage: number | null; vat_on_commission_percentage: number | null },
  defaults: { commission_percentage: number; vat_on_commission_percentage: number },
) {
  return {
    commission_percentage: meter.commission_percentage ?? defaults.commission_percentage,
    vat_on_commission_percentage: meter.vat_on_commission_percentage ?? defaults.vat_on_commission_percentage,
  };
}

export const meterCommissionInput = z
  .object({
    ids: z.array(uuid).min(1, "Select at least one meter").max(1000),
    commission_percentage: percentField.nullable().optional(),
    vat_on_commission_percentage: percentField.nullable().optional(),
  })
  .refine((d) => d.commission_percentage !== undefined || d.vat_on_commission_percentage !== undefined, {
    message: "Enter a Commission or VAT value",
  });

/** Set Commission (%) and/or VAT on Commission (%) on the selected meters. */
export const bulkSetMeterCommission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => meterCommissionInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const patch: Record<string, number | null> = {};
    if (data.commission_percentage !== undefined)
      patch["commission_percentage"] = data.commission_percentage === null ? null : round2(data.commission_percentage);
    if (data.vat_on_commission_percentage !== undefined)
      patch["vat_on_commission_percentage"] =
        data.vat_on_commission_percentage === null ? null : round2(data.vat_on_commission_percentage);
    const { data: rows, error } = await (context.supabase as any)
      .from("meters")
      .update(patch)
      .in("id", data.ids)
      .select("id");
    if (error) throw new Error(error.message);
    return { updated: (rows ?? []).length };
  });
