import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { applyPriceMode, type PriceMode } from "@/lib/prices.functions";

const uuid = z.string().uuid();
const priceInput = z.object({
  ids: z.array(uuid).min(1, "Select at least one meter").max(1000),
  mode: z.enum(["set", "increase_pct", "decrease_pct", "increase_amount", "decrease_amount"]),
  value: z.number().finite().min(0).max(1_000_000),
  note: z.string().trim().max(500).optional().nullable(),
});

async function assertLandlord(context: any): Promise<string> {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "landlord" });
  if (!data) throw new Error("Landlord access required");
  return context.userId as string;
}

/** Landlords propose price changes on linked meters; admins approve them in Price Management. */
export const submitLandlordPriceRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => priceInput.parse(d))
  .handler(async ({ data, context }) => {
    const landlordId = await assertLandlord(context);
    const supabase = context.supabase as any;
    const { data: linked, error: lErr } = await supabase.rpc("landlord_meter_ids");
    if (lErr) throw new Error("Could not check your meters");
    const allowed = new Set(((linked ?? []) as any[]).map((r) => (typeof r === "string" ? r : r.landlord_meter_ids)));
    if (data.ids.some((id) => !allowed.has(id))) throw new Error("Access denied");
    const { data: rows, error } = await supabase.from("meters").select("id, meter_number, price_per_unit, vendor_id").in("id", data.ids);
    if (error) throw new Error(error.message);
    const changes: { id: string; meter_number: string; vendor_id: string; from: number; to: number }[] = [];
    let unchanged = 0;
    for (const row of (rows ?? []) as any[]) {
      if (!row.vendor_id) throw new Error(`Meter ${row.meter_number} has no managing vendor`);
      const from = Number(row.price_per_unit ?? 0);
      const to = applyPriceMode(from, data.mode as PriceMode, data.value);
      if (to < 0) throw new Error(`Meter ${row.meter_number} would get a negative price`);
      if (to === from) { unchanged += 1; continue; }
      changes.push({ id: row.id, meter_number: row.meter_number ?? "", vendor_id: row.vendor_id, from, to });
    }
    if (changes.length) {
      await supabase.from("meter_price_change_requests").update({ status: "rejected", review_note: "Superseded by a newer request" })
        .eq("requested_by", landlordId).eq("status", "pending").in("meter_id", changes.map((c) => c.id));
      const { error: insErr } = await supabase.from("meter_price_change_requests").insert(changes.map((c) => ({
        meter_id: c.id, vendor_id: c.vendor_id, current_price: c.from, requested_price: c.to,
        mode: data.mode, value: data.value, status: "pending", requested_by: landlordId,
        ...(data.note ? { note: data.note } : {}),
      })));
      if (insErr) { console.error("submitLandlordPriceRequests", insErr.code, insErr.message); throw new Error("Could not submit price change request"); }
    }
    return { submitted: changes.length, unchanged };
  });

export const listLandlordPriceRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const landlordId = await assertLandlord(context);
    const supabase = context.supabase as any;
    const { data, error } = await supabase.from("meter_price_change_requests")
      .select("id,created_at,reviewed_at,meter_id,current_price,requested_price,status,note,review_note")
      .eq("requested_by", landlordId).order("created_at", { ascending: false }).limit(500);
    if (error) throw new Error(error.message);
    const list = (data ?? []) as any[];
    const ids = [...new Set(list.map((r) => r.meter_id))];
    const { data: meters } = ids.length ? await supabase.from("meters").select("id, meter_number").in("id", ids.slice(0, 200)) : { data: [] };
    const byId = new Map(((meters ?? []) as any[]).map((m) => [m.id, m.meter_number]));
    return list.map((r) => ({
      id: r.id as string, created_at: r.created_at as string, reviewed_at: (r.reviewed_at ?? null) as string | null,
      meter_number: (byId.get(r.meter_id) ?? "—") as string, current_price: Number(r.current_price ?? 0),
      requested_price: Number(r.requested_price ?? 0), status: r.status as string,
      note: (r.note ?? null) as string | null, review_note: (r.review_note ?? null) as string | null,
    }));
  });
