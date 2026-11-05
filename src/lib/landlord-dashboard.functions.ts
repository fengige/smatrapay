import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ZERO = "00000000-0000-0000-0000-000000000000";
const cents = (v: unknown) => Math.round(Number(v ?? 0) * 100);

/**
 * Landlord dashboard. The landlord is the session user; every read below is
 * filtered to that user's own properties/meters before anything is returned.
 */
export const getLandlordDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as any;
    const { data: isLandlord } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "landlord" });
    if (!isLandlord) throw new Error("Access denied");
    const me = ctx.userId as string;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    const [{ data: props }, { data: meters }] = await Promise.all([
      db.from("properties").select("id, name").eq("landlord_id", me).limit(2000),
      db.from("meters").select("id, meter_number, status").eq("landlord_id", me).limit(5000),
    ]);
    const propIds: string[] = (props ?? []).map((p: any) => p.id);
    const meterIds: string[] = (meters ?? []).map((m: any) => m.id);
    const meterNums: string[] = (meters ?? []).map((m: any) => m.meter_number).filter(Boolean);
    const numById = new Map<string, string>((meters ?? []).map((m: any) => [m.id, m.meter_number]));

    const { data: units } = await db.from("units").select("id, status").in("property_id", propIds.length ? propIds : [ZERO]).limit(10000);
    const unitIds: string[] = (units ?? []).map((u: any) => u.id);

    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const [tokRecent, tok30, payRecent, pay30, assigns] = await Promise.all([
      db.from("meter_tokens").select("id, meter_id, amount, units, status, created_at, reference").in("meter_id", meterIds.length ? meterIds : [ZERO]).eq("action", "credit").order("created_at", { ascending: false }).limit(10),
      db.from("meter_tokens").select("amount, units").in("meter_id", meterIds.length ? meterIds : [ZERO]).eq("action", "credit").eq("status", "issued").gte("created_at", since).limit(10000),
      db.from("bank_notifications").select("id, bank, trans_id, meter_number, trans_amount, status, error_message, created_at").in("meter_number", meterNums.length ? meterNums : ["__none__"]).order("created_at", { ascending: false }).limit(10),
      db.from("bank_notifications").select("trans_amount, status").in("meter_number", meterNums.length ? meterNums : ["__none__"]).gte("created_at", since).limit(10000),
      db.from("unit_assignments").select("user_id, end_date").eq("role", "resident").in("unit_id", unitIds.length ? unitIds : [ZERO]).limit(10000),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    const residentIds = [...new Set<string>((assigns.data ?? []).filter((a: any) => !a.end_date || a.end_date >= today).map((a: any) => a.user_id))];
    const { data: apps } = await db.from("payg_applications").select("id, full_name, product_name, status, created_at")
      .in("resident_id", residentIds.length ? residentIds : [ZERO]).order("created_at", { ascending: false }).limit(20);

    let tokAmt = 0, tokUnits = 0, payAmt = 0, payFailed = 0;
    for (const t of tok30.data ?? []) { tokAmt += cents(t.amount); tokUnits += Math.round(Number(t.units ?? 0) * 10); }
    for (const p of pay30.data ?? []) { payAmt += cents(p.trans_amount); if (["failed", "rejected", "retry_pending"].includes(p.status)) payFailed++; }

    return {
      counts: {
        properties: propIds.length,
        units: unitIds.length,
        occupiedUnits: (units ?? []).filter((u: any) => u.status === "occupied").length,
        meters: meterIds.length,
        activeMeters: (meters ?? []).filter((m: any) => m.status === "active").length,
        residents: residentIds.length,
      },
      last30: {
        tokens: (tok30.data ?? []).length, tokenAmount: tokAmt / 100, tokenUnits: tokUnits / 10,
        payments: (pay30.data ?? []).length, paymentAmount: payAmt / 100, failedPayments: payFailed,
      },
      recentTokens: (tokRecent.data ?? []).map((t: any) => ({ id: t.id, meter: numById.get(t.meter_id) ?? "—", amount: Number(t.amount ?? 0), units: t.units == null ? null : Number(t.units), status: t.status, at: t.created_at })),
      recentPayments: (payRecent.data ?? []).map((p: any) => ({ id: p.id, bank: p.bank, transId: p.trans_id, meter: p.meter_number, amount: Number(p.trans_amount ?? 0), status: p.status, error: p.error_message, at: p.created_at })),
      applications: (apps ?? []).map((a: any) => ({ id: a.id, name: a.full_name, product: a.product_name, status: a.status, at: a.created_at })),
    };
  });
