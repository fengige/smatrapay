import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type HolderKind = "agent" | "vendor" | "landlord";

export type HolderMeterSummary = {
  holderId: string;
  holderKind: HolderKind;
  name: string;
  email: string | null;
  total: number;
  active: number;
  inactive: number;
  assignedToUnits: number;
  byType: Record<string, number>;
  tokens: number;
  units: number;
  amount: number;
  trend: number[];
};

const inputSchema = z.object({
  days: z.number().int().min(7).max(90).optional(),
});

/** Meter portfolio + usage trends grouped by agent / vendor / landlord. */
export const getMeterDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Admin access required");

    const days = data.days ?? 30;

    const { data: meters, error } = await supabase
      .from("meters")
      .select("id, meter_number, type, status, unit_id, agent_id, vendor_id, landlord_id");
    if (error) throw new Error(error.message);
    const meterRows = meters ?? [];

    const dayMs = 86400000;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const windowStart = new Date(startOfToday.getTime() - (days - 1) * dayMs);

    const { data: tokens, error: tokenError } = await supabase
      .from("meter_tokens")
      .select("meter_id, units, amount, created_at, status")
      .gte("created_at", windowStart.toISOString());
    if (tokenError) throw new Error(tokenError.message);
    const tokenRows = (tokens ?? []).filter((t: any) => t.status !== "revoked");

    // vendor_id on meters is a free-form text column; resolve only uuid values.
    const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const personIds = [
      ...new Set(
        meterRows
          .flatMap((m: any) => [m.agent_id, m.landlord_id, m.vendor_id])
          .filter((v: any): v is string => typeof v === "string" && uuidLike.test(v)),
      ),
    ];

    let people: any[] = [];
    if (personIds.length) {
      const { data: users, error: usersError } = await supabase
        .from("users")
        .select("id, name, email")
        .in("id", personIds);
      if (usersError) throw new Error(usersError.message);
      people = users ?? [];
    }
    const personById = new Map(people.map((p) => [p.id as string, p]));

    // Usage per meter over the window, and a global daily trend.
    const perMeter = new Map<string, { tokens: number; units: number; amount: number; trend: number[] }>();
    const globalTrend = Array.from({ length: days }, () => 0);

    for (const t of tokenRows as any[]) {
      const meterId = t.meter_id as string;
      const bucket =
        perMeter.get(meterId) ??
        { tokens: 0, units: 0, amount: 0, trend: Array.from({ length: days }, () => 0) };
      const idx = Math.floor((new Date(t.created_at).getTime() - windowStart.getTime()) / dayMs);
      const units = Number(t.units ?? 0);
      bucket.tokens += 1;
      bucket.units += units;
      bucket.amount += Number(t.amount ?? 0);
      if (idx >= 0 && idx < days) {
        bucket.trend[idx] = (bucket.trend[idx] ?? 0) + units;
        globalTrend[idx] = (globalTrend[idx] ?? 0) + units;
      }
      perMeter.set(meterId, bucket);
    }

    const holders = new Map<string, HolderMeterSummary>();
    const holderFor = (kind: HolderKind, id: string): HolderMeterSummary => {
      const key = `${kind}:${id}`;
      let holder = holders.get(key);
      if (!holder) {
        const person = personById.get(id);
        holder = {
          holderId: id,
          holderKind: kind,
          name: (person?.name as string) || (person?.email as string) || "Unknown",
          email: (person?.email as string) ?? null,
          total: 0,
          active: 0,
          inactive: 0,
          assignedToUnits: 0,
          byType: {},
          tokens: 0,
          units: 0,
          amount: 0,
          trend: Array.from({ length: days }, () => 0),
        };
        holders.set(key, holder);
      }
      return holder;
    };

    let unassigned = 0;
    for (const m of meterRows as any[]) {
      const usage = perMeter.get(m.id as string);
      const kinds: Array<[HolderKind, string | null]> = [
        ["agent", m.agent_id],
        ["vendor", typeof m.vendor_id === "string" && uuidLike.test(m.vendor_id) ? m.vendor_id : null],
        ["landlord", m.landlord_id],
      ];
      let attached = false;
      for (const [kind, id] of kinds) {
        if (!id) continue;
        attached = true;
        const holder = holderFor(kind, id);
        holder.total += 1;
        if (String(m.status).toLowerCase() === "active") holder.active += 1;
        else holder.inactive += 1;
        if (m.unit_id) holder.assignedToUnits += 1;
        const type = (m.type as string) || "Unknown";
        holder.byType[type] = (holder.byType[type] ?? 0) + 1;
        if (usage) {
          holder.tokens += usage.tokens;
          holder.units += usage.units;
          holder.amount += usage.amount;
          for (let i = 0; i < days; i += 1) {
            holder.trend[i] = (holder.trend[i] ?? 0) + (usage.trend[i] ?? 0);
          }
        }
      }
      if (!attached) unassigned += 1;
    }

    const rows = [...holders.values()].sort((a, b) => b.total - a.total || b.units - a.units);

    const totals = {
      meters: meterRows.length,
      active: meterRows.filter((m: any) => String(m.status).toLowerCase() === "active").length,
      unassigned,
      holders: rows.length,
      tokens: tokenRows.length,
      units: tokenRows.reduce((sum: number, t: any) => sum + Number(t.units ?? 0), 0),
      amount: tokenRows.reduce((sum: number, t: any) => sum + Number(t.amount ?? 0), 0),
    };

    const trendDates = Array.from({ length: days }, (_, i) =>
      new Date(windowStart.getTime() + i * dayMs).toISOString().slice(0, 10),
    );

    return { days, trendDates, globalTrend, totals, rows };
  });
