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

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */

export type RouteRow = {
  route_id: number;
  zone_id: number;
  route_code: string;
  route_name: string;
  status: string;
  street_count: number;
  created_at: string;
};

const routeInput = z.object({
  zone_id: z.number().int().positive(),
  route_code: z
    .string()
    .trim()
    .min(2, "Route code is required")
    .max(20)
    .transform((v) => v.toUpperCase()),
  route_name: z.string().trim().min(2, "Route name is required").max(100),
  status: z.enum(["Active", "Inactive"]).default("Active"),
});

const routeUpdateInput = routeInput.extend({ route_id: z.number().int().positive() });

export const listRoutes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ zone_id: z.number().int().positive() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { data: rows, error } = await context.supabase
      .from("routes")
      .select("route_id, zone_id, route_code, route_name, status, created_at")
      .eq("zone_id", data.zone_id)
      .order("route_code", { ascending: true });
    if (error) throw new Error(error.message);

    const ids = (rows ?? []).map((r: any) => r.route_id);
    const counts = new Map<number, number>();
    if (ids.length) {
      const { data: streetRows } = await context.supabase
        .from("streets")
        .select("route_id")
        .in("route_id", ids);
      for (const s of (streetRows ?? []) as any[]) {
        counts.set(s.route_id, (counts.get(s.route_id) ?? 0) + 1);
      }
    }

    const routes: RouteRow[] = (rows ?? []).map((r: any) => ({
      route_id: r.route_id,
      zone_id: r.zone_id,
      route_code: r.route_code ?? "",
      route_name: r.route_name ?? "",
      status: r.status ?? "Active",
      street_count: counts.get(r.route_id) ?? 0,
      created_at: r.created_at,
    }));
    return { routes };
  });

export const addRoute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => routeInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { error } = await context.supabase.from("routes").insert(data as never);
    if (error) {
      if (error.code === "23505") throw new Error("A route with this code already exists");
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const updateRoute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => routeUpdateInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { route_id, ...values } = data;
    const { error } = await context.supabase
      .from("routes")
      .update(values as never)
      .eq("route_id", route_id);
    if (error) {
      if (error.code === "23505") throw new Error("A route with this code already exists");
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteRoute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ route_id: z.number().int().positive() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { error } = await context.supabase
      .from("routes")
      .delete()
      .eq("route_id", data.route_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Streets                                                             */
/* ------------------------------------------------------------------ */

export type StreetRow = {
  street_id: number;
  route_id: number;
  street_name: string;
  postal_code: string | null;
  created_at: string;
};

const streetInput = z.object({
  route_id: z.number().int().positive(),
  street_name: z.string().trim().min(2, "Street name is required").max(150),
  postal_code: z
    .string()
    .trim()
    .max(20)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null)),
});

const streetUpdateInput = streetInput.extend({ street_id: z.number().int().positive() });

export const listStreets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ route_id: z.number().int().positive() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { data: rows, error } = await context.supabase
      .from("streets")
      .select("street_id, route_id, street_name, postal_code, created_at")
      .eq("route_id", data.route_id)
      .order("street_name", { ascending: true });
    if (error) throw new Error(error.message);
    const streets: StreetRow[] = (rows ?? []).map((r: any) => ({
      street_id: r.street_id,
      route_id: r.route_id,
      street_name: r.street_name ?? "",
      postal_code: r.postal_code ?? null,
      created_at: r.created_at,
    }));
    return { streets };
  });

export const addStreet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => streetInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { data: existing } = await context.supabase
      .from("streets")
      .select("street_id")
      .eq("route_id", data.route_id)
      .ilike("street_name", data.street_name)
      .maybeSingle();
    if (existing) throw new Error("This street already exists on the route");
    const { error } = await context.supabase.from("streets").insert(data as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateStreet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => streetUpdateInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { street_id, ...values } = data;
    const { error } = await context.supabase
      .from("streets")
      .update(values as never)
      .eq("street_id", street_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteStreet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ street_id: z.number().int().positive() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { error } = await context.supabase
      .from("streets")
      .delete()
      .eq("street_id", data.street_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* CSV import                                                          */
/* ------------------------------------------------------------------ */

export type ZoneImportRowResult = {
  row: number;
  zone_name: string;
  status: "created" | "skipped" | "failed";
  message?: string;
};

const importInput = z.object({
  rows: z
    .array(z.object({ row: z.number().int(), zone_name: z.string(), description: z.string() }))
    .max(1000, "A maximum of 1000 rows can be imported at once"),
  skipExisting: z.boolean().default(true),
});

export const importZones = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => importInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabase } = context;

    const { data: existingRows } = await supabase.from("zones").select("zone_name");
    const existing = new Set(
      ((existingRows ?? []) as any[]).map((r) => String(r.zone_name).trim().toLowerCase()),
    );
    const seen = new Set<string>();
    const results: ZoneImportRowResult[] = [];

    for (const r of data.rows) {
      const name = r.zone_name.trim();
      const key = name.toLowerCase();
      if (name.length < 2) {
        results.push({ row: r.row, zone_name: name, status: "failed", message: "Zone name must be at least 2 characters" });
        continue;
      }
      if (name.length > 100) {
        results.push({ row: r.row, zone_name: name, status: "failed", message: "Zone name exceeds 100 characters" });
        continue;
      }
      if (r.description.trim().length > 500) {
        results.push({ row: r.row, zone_name: name, status: "failed", message: "Description exceeds 500 characters" });
        continue;
      }
      if (seen.has(key)) {
        results.push({ row: r.row, zone_name: name, status: "failed", message: "Duplicate zone name in the file" });
        continue;
      }
      seen.add(key);
      if (existing.has(key)) {
        if (data.skipExisting) {
          results.push({ row: r.row, zone_name: name, status: "skipped", message: "Zone already exists" });
        } else {
          results.push({ row: r.row, zone_name: name, status: "failed", message: "Zone already exists" });
        }
        continue;
      }

      const { error } = await supabase
        .from("zones")
        .insert({ zone_name: name, description: r.description.trim() || null } as never);
      if (error) {
        results.push({
          row: r.row,
          zone_name: name,
          status: "failed",
          message: error.code === "23505" ? "Zone already exists" : error.message,
        });
        continue;
      }
      existing.add(key);
      results.push({ row: r.row, zone_name: name, status: "created" });
    }

    return {
      results,
      created: results.filter((r) => r.status === "created").length,
      skipped: results.filter((r) => r.status === "skipped").length,
      failed: results.filter((r) => r.status === "failed").length,
    };
  });

/* ------------------------------------------------------------------ */
/* Audit log                                                           */
/* ------------------------------------------------------------------ */

export type ZoneAuditRow = {
  id: string;
  zone_id: number | null;
  zone_name: string | null;
  action: string;
  changes: Record<string, { old: string | null; new: string | null }>;
  actor_name: string;
  created_at: string;
};

function normalizeChanges(raw: unknown): Record<string, { old: string | null; new: string | null }> {
  const out: Record<string, { old: string | null; new: string | null }> = {};
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, any>)) {
      out[k] = {
        old: v?.old == null ? null : String(v.old),
        new: v?.new == null ? null : String(v.new),
      };
    }
  }
  return out;
}

export const listZoneAuditLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ zone_id: z.number().int().positive().nullable().optional() })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    let query = context.supabase
      .from("zone_audit_logs")
      .select("id, zone_id, zone_name, action, changes, actor_id, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data?.zone_id) query = query.eq("zone_id", data.zone_id);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const actorIds = Array.from(
      new Set(((rows ?? []) as any[]).map((r) => r.actor_id).filter(Boolean)),
    );
    const names = new Map<string, string>();
    if (actorIds.length) {
      const { data: users } = await context.supabase
        .from("users")
        .select("id, name, email")
        .in("id", actorIds);
      for (const u of (users ?? []) as any[]) {
        names.set(u.id, u.name || u.email || "Unknown user");
      }
    }

    const logs: ZoneAuditRow[] = ((rows ?? []) as any[]).map((r) => ({
      id: r.id,
      zone_id: r.zone_id,
      zone_name: r.zone_name,
      action: r.action,
      changes: normalizeChanges(r.changes),
      actor_name: r.actor_id ? (names.get(r.actor_id) ?? "Unknown user") : "System",
      created_at: r.created_at,
    }));
    return { logs };
  });
