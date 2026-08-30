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

export type ZoneRow = {
  zone_id: number;
  zone_name: string;
  description: string | null;
  route_count: number;
  created_at: string;
  updated_at: string;
};

const zoneInput = z.object({
  zone_name: z.string().trim().min(2, "Zone name is required").max(100),
  description: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
});

const zoneUpdateInput = zoneInput.extend({ zone_id: z.number().int().positive() });

export const listZones = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabase } = context;

    const { data: rows, error } = await supabase
      .from("zones")
      .select("zone_id, zone_name, description, created_at, updated_at")
      .order("zone_name", { ascending: true });
    if (error) throw new Error(error.message);

    const { data: routeRows } = await supabase.from("routes").select("zone_id");
    const counts = new Map<number, number>();
    for (const r of (routeRows ?? []) as any[]) {
      counts.set(r.zone_id, (counts.get(r.zone_id) ?? 0) + 1);
    }

    const zones: ZoneRow[] = (rows ?? []).map((r: any) => ({
      zone_id: r.zone_id,
      zone_name: r.zone_name ?? "",
      description: r.description ?? null,
      route_count: counts.get(r.zone_id) ?? 0,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));

    return { zones };
  });

export const addZone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => zoneInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { data: inserted, error } = await context.supabase
      .from("zones")
      .insert(data as never)
      .select("zone_id")
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("A zone with this name already exists");
      throw new Error(error.message);
    }
    return { ok: true, zone_id: inserted?.zone_id as number };
  });

export const updateZone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => zoneUpdateInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { zone_id, ...values } = data;
    const { error } = await context.supabase
      .from("zones")
      .update(values as never)
      .eq("zone_id", zone_id);
    if (error) {
      if (error.code === "23505") throw new Error("A zone with this name already exists");
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteZone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ zone_id: z.number().int().positive() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { error } = await context.supabase
      .from("zones")
      .delete()
      .eq("zone_id", data.zone_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
