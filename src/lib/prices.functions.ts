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
