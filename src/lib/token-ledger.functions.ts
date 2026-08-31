import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type LedgerHolderKind = "agent" | "vendor" | "landlord";

export type LedgerEntry = {
  id: string;
  created_at: string;
  meter_id: string;
  meter_number: string;
  meter_type: string;
  action: string;
  status: string;
  units: number;
  amount: number;
  /** Meter index after this token was applied (initial reading + cumulative units). */
  reading: number;
  holders: { kind: LedgerHolderKind; id: string; name: string }[];
};

export type LedgerHolderTotals = {
  kind: LedgerHolderKind;
  id: string;
  name: string;
  email: string | null;
  meters: number;
  tokens: number;
  units: number;
  amount: number;
  trend: number[];
};

const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const inputSchema = z.object({
  days: z.number().int().min(7).max(90).optional(),
  kind: z.enum(["all", "agent", "vendor", "landlord"]).optional(),
  holderId: z.string().optional().nullable(),
  q: z.string().trim().optional().nullable(),
  includeRevoked: z.boolean().optional(),
  limit: z.number().int().min(10).max(500).optional(),
});

/**
 * Token ledger: every token transaction with its meter, units, resulting meter
 * reading and the agent / vendor / landlord currently holding the meter.
 * Because attribution follows the meter's current holder, re-assigning a meter
 * moves its tokens and units to the new holder automatically.
 */
export const getTokenLedger = createServerFn({ method: "GET" })
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
    const limit = data.limit ?? 200;
    const dayMs = 86400000;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const windowStart = new Date(startOfToday.getTime() - (days - 1) * dayMs);

    const { data: meters, error: meterError } = await supabase
      .from("meters")
      .select("id, meter_number, type, initial_reading, agent_id, vendor_id, landlord_id");
    if (meterError) throw new Error(meterError.message);
    const meterRows = (meters ?? []) as any[];
    const meterById = new Map(meterRows.map((m) => [m.id as string, m]));

    const personIds = [
      ...new Set(
        meterRows
          .flatMap((m) => [m.agent_id, m.landlord_id, m.vendor_id])
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

    const holdersOf = (m: any): { kind: LedgerHolderKind; id: string; name: string }[] => {
      const pairs: Array<[LedgerHolderKind, string | null]> = [
        ["agent", m.agent_id ?? null],
        ["vendor", typeof m.vendor_id === "string" && uuidLike.test(m.vendor_id) ? m.vendor_id : null],
        ["landlord", m.landlord_id ?? null],
      ];
      return pairs
        .filter(([, id]) => !!id)
        .map(([kind, id]) => {
          const p = personById.get(id as string);
          return {
            kind,
            id: id as string,
            name: (p?.name as string) || (p?.email as string) || "Unknown",
          };
        });
    };

    // All tokens (full history) so running readings are correct.
    const { data: tokens, error: tokenError } = await supabase
      .from("meter_tokens")
      .select("id, meter_id, action, status, units, amount, created_at, expires_at")
      .order("created_at", { ascending: true })
      .limit(5000);
    if (tokenError) throw new Error(tokenError.message);

    const effectiveStatus = (t: any): string => {
      if (t.status === "issued" && new Date(t.expires_at).getTime() < Date.now()) return "expired";
      return t.status as string;
    };

    const running = new Map<string, number>();
    const all: LedgerEntry[] = [];
    for (const t of (tokens ?? []) as any[]) {
      const meter = meterById.get(t.meter_id as string);
      if (!meter) continue;
      const status = effectiveStatus(t);
      const units = Number(t.units ?? 0);
      const base = running.get(t.meter_id as string) ?? Number(meter.initial_reading ?? 0);
      const reading = status === "revoked" ? base : base + units;
      running.set(t.meter_id as string, reading);
      all.push({
        id: t.id as string,
        created_at: t.created_at as string,
        meter_id: t.meter_id as string,
        meter_number: (meter.meter_number as string) ?? "",
        meter_type: (meter.type as string) ?? "",
        action: t.action as string,
        status,
        units,
        amount: Number(t.amount ?? 0),
        reading,
        holders: holdersOf(meter),
      });
    }

    const inWindow = all.filter((e) => new Date(e.created_at).getTime() >= windowStart.getTime());
    const counted = inWindow.filter((e) => (data.includeRevoked ? true : e.status !== "revoked"));

    // Per-holder totals + daily trend, attributed to the meter's current holder.
    const totalsByHolder = new Map<string, LedgerHolderTotals>();
    const meterSeen = new Map<string, Set<string>>();
    for (const e of counted) {
      const idx = Math.floor((new Date(e.created_at).getTime() - windowStart.getTime()) / dayMs);
      for (const h of e.holders) {
        const key = `${h.kind}:${h.id}`;
        let row = totalsByHolder.get(key);
        if (!row) {
          const p = personById.get(h.id);
          row = {
            kind: h.kind,
            id: h.id,
            name: h.name,
            email: (p?.email as string) ?? null,
            meters: 0,
            tokens: 0,
            units: 0,
            amount: 0,
            trend: Array.from({ length: days }, () => 0),
          };
          totalsByHolder.set(key, row);
          meterSeen.set(key, new Set());
        }
        const seen = meterSeen.get(key)!;
        if (!seen.has(e.meter_id)) {
          seen.add(e.meter_id);
          row.meters += 1;
        }
        row.tokens += 1;
        row.units += e.units;
        row.amount += e.amount;
        if (idx >= 0 && idx < days) row.trend[idx] = (row.trend[idx] ?? 0) + e.units;
      }
    }

    // Filters for the transaction list.
    const q = (data.q ?? "").trim().toLowerCase();
    const kind = data.kind ?? "all";
    const entries = counted
      .filter((e) => (kind === "all" ? true : e.holders.some((h) => h.kind === kind)))
      .filter((e) => (data.holderId ? e.holders.some((h) => h.id === data.holderId) : true))
      .filter((e) =>
        q
          ? e.meter_number.toLowerCase().includes(q) ||
            e.holders.some((h) => h.name.toLowerCase().includes(q))
          : true,
      )
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const shown = entries.slice(0, limit);

    const globalTrend = Array.from({ length: days }, () => 0);
    for (const e of entries) {
      const idx = Math.floor((new Date(e.created_at).getTime() - windowStart.getTime()) / dayMs);
      if (idx >= 0 && idx < days) globalTrend[idx] = (globalTrend[idx] ?? 0) + e.units;
    }

    const trendDates = Array.from({ length: days }, (_, i) =>
      new Date(windowStart.getTime() + i * dayMs).toISOString().slice(0, 10),
    );

    return {
      days,
      trendDates,
      globalTrend,
      totals: {
        transactions: entries.length,
        units: entries.reduce((s, e) => s + e.units, 0),
        amount: entries.reduce((s, e) => s + e.amount, 0),
        meters: new Set(entries.map((e) => e.meter_id)).size,
      },
      holders: [...totalsByHolder.values()].sort((a, b) => b.units - a.units),
      entries: shown,
      truncated: entries.length > shown.length,
    };
  });
