import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type VendorLedgerHolderKind = "agent" | "landlord";

export type VendorLedgerEntry = {
  id: string;
  created_at: string;
  meter_id: string;
  meter_number: string;
  meter_type: string;
  price_per_unit: number;
  action: string;
  status: string;
  units: number;
  amount: number;
  reading: number;
  holders: { kind: VendorLedgerHolderKind; id: string; name: string }[];
};

export type VendorLedgerTypeRevenue = {
  type: string;
  meters: number;
  transactions: number;
  units: number;
  amount: number;
  avgPricePerUnit: number;
};

export type VendorLedgerHolderTotals = {
  kind: VendorLedgerHolderKind;
  id: string;
  name: string;
  email: string | null;
  meters: number;
  tokens: number;
  units: number;
  amount: number;
  trend: number[];
};

const inputSchema = z.object({
  days: z.number().int().min(7).max(90).optional(),
  kind: z.enum(["all", "agent", "landlord"]).optional(),
  holderId: z.string().optional().nullable(),
  q: z.string().trim().optional().nullable(),
  includeRevoked: z.boolean().optional(),
  limit: z.number().int().min(10).max(500).optional(),
});

/**
 * Token ledger limited to the meters registered to the signed-in vendor.
 * The vendor is resolved from the session; no client-supplied vendor id is trusted.
 */
export const getVendorTokenLedger = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const { assertVendor } = await import("@/lib/vendor.server");
    const vendorId = await assertVendor(context as never);
    const supabase = context.supabase as any;

    const days = data.days ?? 30;
    const limit = data.limit ?? 200;
    const dayMs = 86400000;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const windowStart = new Date(startOfToday.getTime() - (days - 1) * dayMs);

    const { data: meters, error: meterError } = await supabase
      .from("meters")
      .select("id, meter_number, type, price_per_unit, initial_reading, agent_id, landlord_id")
      .eq("vendor_id", vendorId);
    if (meterError) throw new Error(meterError.message);
    const meterRows = (meters ?? []) as any[];
    const meterById = new Map(meterRows.map((m) => [m.id as string, m]));
    const meterIds = meterRows.map((m) => m.id as string);

    const personIds = [
      ...new Set(
        meterRows
          .flatMap((m) => [m.agent_id, m.landlord_id])
          .filter((v: any): v is string => typeof v === "string"),
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

    const holdersOf = (m: any): { kind: VendorLedgerHolderKind; id: string; name: string }[] => {
      const pairs: Array<[VendorLedgerHolderKind, string | null]> = [
        ["agent", m.agent_id ?? null],
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

    let tokenRows: any[] = [];
    if (meterIds.length) {
      const { data: tokens, error: tokenError } = await supabase
        .from("meter_tokens")
        .select("id, meter_id, action, status, units, amount, created_at, expires_at")
        .in("meter_id", meterIds)
        .order("created_at", { ascending: true })
        .limit(5000);
      if (tokenError) throw new Error(tokenError.message);
      tokenRows = tokens ?? [];
    }

    const effectiveStatus = (t: any): string =>
      t.status === "issued" && new Date(t.expires_at).getTime() < Date.now()
        ? "expired"
        : (t.status as string);

    const running = new Map<string, number>();
    const all: VendorLedgerEntry[] = [];
    for (const t of tokenRows) {
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
        price_per_unit: Number(meter.price_per_unit ?? 0),
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

    const totalsByHolder = new Map<string, VendorLedgerHolderTotals>();
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

    const typeAgg = new Map<
      string,
      { type: string; metersSet: Set<string>; transactions: number; units: number; amount: number; priceSum: number }
    >();
    for (const e of entries) {
      const type = e.meter_type || "Unknown";
      let row = typeAgg.get(type);
      if (!row) {
        row = { type, metersSet: new Set(), transactions: 0, units: 0, amount: 0, priceSum: 0 };
        typeAgg.set(type, row);
      }
      if (!row.metersSet.has(e.meter_id)) {
        row.metersSet.add(e.meter_id);
        row.priceSum += e.price_per_unit;
      }
      row.transactions += 1;
      row.units += e.units;
      row.amount += e.amount;
    }
    const revenueByType: VendorLedgerTypeRevenue[] = [...typeAgg.values()]
      .map((r) => ({
        type: r.type,
        meters: r.metersSet.size,
        transactions: r.transactions,
        units: r.units,
        amount: r.amount,
        avgPricePerUnit: r.metersSet.size ? r.priceSum / r.metersSet.size : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

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
      revenueByType,
      holders: [...totalsByHolder.values()].sort((a, b) => b.units - a.units),
      entries: shown,
      truncated: entries.length > shown.length,
    };
  });
