import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PosSale = {
  id: string;
  created_at: string;
  meter_number: string;
  token: string;
  units: number;
  amount: number;
  reference: string | null;
  method: string;
  status: "issued" | "revoked" | "expired";
  cashier: string;
};

export const POS_METHODS = ["cash", "mpesa", "card", "bank", "other"] as const;

/** Payment method is stored as an uppercase prefix on the token reference. */
function methodFrom(reference: string | null): string {
  const first = (reference ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return (POS_METHODS as readonly string[]).includes(first) ? first : "other";
}

/** Credit tokens (counter sales) issued within a date range, for shift reporting. */
export const listPosSales = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        from: z.string().min(10),
        to: z.string().min(10),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<PosSale[]> => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Admin access required");

    const from = new Date(`${data.from}T00:00:00`).toISOString();
    const to = new Date(`${data.to}T23:59:59.999`).toISOString();

    const { data: rows, error } = await supabase
      .from("meter_tokens")
      .select("*")
      .eq("action", "credit")
      .gte("created_at", from)
      .lte("created_at", to)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);

    const list = (rows ?? []) as any[];
    if (!list.length) return [];

    const meterIds = [...new Set(list.map((r) => r.meter_id))];
    const { data: meters } = await supabase
      .from("meters")
      .select("id, meter_number")
      .in("id", meterIds);
    const meterById = new Map<string, string>(
      (meters ?? []).map((m: any) => [m.id as string, m.meter_number as string]),
    );

    const actorIds = [...new Set(list.map((r) => r.issued_by).filter(Boolean))] as string[];
    const actorById = new Map<string, string>();
    if (actorIds.length) {
      const { data: users } = await supabase
        .from("users")
        .select("id, name, email")
        .in("id", actorIds);
      for (const u of (users ?? []) as any[]) actorById.set(u.id, u.name ?? u.email ?? u.id);
    }

    return list.map((r) => ({
      id: r.id,
      created_at: r.created_at,
      meter_number: meterById.get(r.meter_id) ?? "—",
      token: r.token,
      units: Number(r.units ?? 0),
      amount: Number(r.amount ?? 0),
      reference: r.reference ?? null,
      method: methodFrom(r.reference ?? null),
      status:
        r.status === "issued" && new Date(r.expires_at).getTime() < Date.now()
          ? ("expired" as const)
          : (r.status as "issued" | "revoked" | "expired"),
      cashier: r.issued_by ? (actorById.get(r.issued_by) ?? "Unknown") : "System",
    }));
  });
