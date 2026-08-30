import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createUserSchema } from "@/lib/user-schema";

/** Vendors never carry residency details, so those fields are dropped entirely. */
const vendorCreateSchema = createUserSchema.omit({
  property: true,
  building: true,
  unit_number: true,
  move_in_date: true,
  role: true,
});

const vendorUpdateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().max(120).nullable().optional(),
  username: z.string().trim().max(60).nullable().optional(),
  email: z.string().trim().email().max(255).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  bio: z.string().trim().max(1000).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  status: z.enum(["active", "inactive", "suspended", "pending"]).optional(),
});

export const createVendor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => vendorCreateSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Only admins can create vendors");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { name: data.name },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Could not create vendor");

    const id = created.user.id;
    const { error: profileError } = await supabaseAdmin.from("users").upsert({
      id,
      name: data.name,
      email: data.email,
      username: data.username || null,
      phone: data.phone || null,
      bio: data.bio || null,
      notes: data.notes || null,
      status: data.status,
      created_by: userId,
      updated_by: userId,
    });
    if (profileError) throw new Error(profileError.message);

    await supabaseAdmin.from("user_roles").delete().eq("user_id", id);
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: id, role: "vendor" });
    if (roleError) throw new Error(roleError.message);

    return { ok: true, id };
  });

export const updateVendor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => vendorUpdateSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { id, ...fields } = data;
    const patch = Object.fromEntries(
      Object.entries(fields).filter(([, value]) => value !== undefined),
    );

    const { error } = await supabase
      .from("users")
      .update({ ...patch, updated_by: userId })
      .eq("id", id);
    if (error) throw new Error(error.message);

    return { ok: true };
  });

/** Meters registered under a vendor account. */
export const listVendorMeters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ vendorId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: meters, error } = await context.supabase
      .from("meters")
      .select("id, meter_number, serial_number, type, price_per_unit, status, unit_id, created_at")
      .eq("vendor_id", data.vendorId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { meters: meters ?? [] };
  });

const assignableFilterSchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.string().trim().max(40).optional(),
  type: z.string().trim().max(60).optional(),
});

/** Meters that are not yet registered to any vendor (available for assignment). */
export const listAssignableVendorMeters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => assignableFilterSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("meters")
      .select("id, meter_number, serial_number, type, status, landlord_id, agent_id, vendor_id")
      .is("vendor_id", null)
      .order("meter_number", { ascending: true })
      .limit(500);

    const search = data.search?.trim();
    if (search) {
      const term = search.replace(/[%,()]/g, "");
      query = query.or(
        `meter_number.ilike.%${term}%,serial_number.ilike.%${term}%,type.ilike.%${term}%,status.ilike.%${term}%`,
      );
    }
    if (data.status && data.status !== "all") query = query.eq("status", data.status);
    if (data.type && data.type !== "all") query = query.eq("type", data.type);

    const { data: meters, error } = await query;
    if (error) throw new Error(error.message);
    return { meters: meters ?? [] };
  });

const assignSchema = z.object({
  vendorId: z.string().uuid(),
  meterIds: z.array(z.string().uuid()).min(1).max(500),
});

type MeterResult = {
  id: string;
  meter_number: string;
  ok: boolean;
  reason?: string;
};

/** Register selected meters to a vendor. Meters held by someone else are rejected. */
export const assignMetersToVendor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => assignSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Only admins can assign meters");

    const { data: rows, error: readError } = await supabase
      .from("meters")
      .select("id, meter_number, landlord_id, agent_id, vendor_id")
      .in("id", data.meterIds);
    if (readError) throw new Error(readError.message);

    const results: MeterResult[] = [];
    const eligible: string[] = [];

    for (const id of data.meterIds) {
      const row = (rows ?? []).find((r) => r.id === id);
      if (!row) {
        results.push({ id, meter_number: id, ok: false, reason: "Meter no longer exists" });
        continue;
      }
      const conflict =
        row.vendor_id && row.vendor_id !== data.vendorId
          ? "Already registered to another vendor"
          : row.landlord_id
            ? "Already registered to a landlord"
            : row.agent_id
              ? "Already registered to a agent"
              : null;
      if (row.vendor_id === data.vendorId) {
        results.push({
          id,
          meter_number: row.meter_number,
          ok: false,
          reason: "Already registered to this vendor",
        });
        continue;
      }
      if (conflict) {
        results.push({ id, meter_number: row.meter_number, ok: false, reason: conflict });
        continue;
      }
      eligible.push(id);
    }

    if (eligible.length > 0) {
      const { data: updated, error } = await supabase
        .from("meters")
        .update({ vendor_id: data.vendorId })
        .in("id", eligible)
        .is("vendor_id", null)
        .select("id, meter_number");
      if (error) throw new Error(error.message);

      const updatedIds = new Set((updated ?? []).map((r) => r.id));
      for (const id of eligible) {
        const row = (rows ?? []).find((r) => r.id === id);
        results.push({
          id,
          meter_number: row?.meter_number ?? id,
          ok: updatedIds.has(id),
          ...(updatedIds.has(id)
            ? {}
            : { reason: "Claimed by another user while you were reviewing" }),
        });
      }
    }

    return {
      ok: true,
      assigned: results.filter((r) => r.ok).length,
      skipped: results.filter((r) => !r.ok).map((r) => r.meter_number),
      results,
    };
  });

/** Remove the vendor registration from selected meters. */
export const unassignMetersFromVendor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => assignSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Only admins can unassign meters");

    const { data: rows, error: readError } = await supabase
      .from("meters")
      .select("id, meter_number, vendor_id")
      .in("id", data.meterIds);
    if (readError) throw new Error(readError.message);

    const results: MeterResult[] = [];
    const eligible: string[] = [];
    for (const id of data.meterIds) {
      const row = (rows ?? []).find((r) => r.id === id);
      if (!row) {
        results.push({ id, meter_number: id, ok: false, reason: "Meter no longer exists" });
      } else if (row.vendor_id !== data.vendorId) {
        results.push({
          id,
          meter_number: row.meter_number,
          ok: false,
          reason: row.vendor_id
            ? "Registered to a different vendor"
            : "Not registered to any vendor",
        });
      } else {
        eligible.push(id);
      }
    }

    if (eligible.length === 0) {
      throw new Error(results[0]?.reason ?? "No eligible meters to unassign");
    }

    const { data: updated, error } = await supabase
      .from("meters")
      .update({ vendor_id: null })
      .in("id", eligible)
      .eq("vendor_id", data.vendorId)
      .select("id, meter_number");
    if (error) throw new Error(error.message);

    const updatedIds = new Set((updated ?? []).map((r) => r.id));
    for (const id of eligible) {
      const row = (rows ?? []).find((r) => r.id === id);
      results.push({
        id,
        meter_number: row?.meter_number ?? id,
        ok: updatedIds.has(id),
        ...(updatedIds.has(id) ? {} : { reason: "Registration changed before saving" }),
      });
    }

    return { ok: true, unassigned: updatedIds.size, results };
  });

/** Assignment history: who registered/unassigned which meter to this vendor and when. */
export const listVendorAssignmentHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ vendorId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: logs, error } = await supabase
      .from("meter_audit_logs")
      .select("id, meter_id, actor_id, action, changes, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const relevant = (logs ?? []).filter((log) => {
      const change = (log.changes as Record<string, { old?: unknown; new?: unknown }> | null)?.[
        "vendor_id"
      ];
      if (!change) return false;
      return change.old === data.vendorId || change.new === data.vendorId;
    });

    const meterIds = [...new Set(relevant.map((l) => l.meter_id))];
    const actorIds = [...new Set(relevant.map((l) => l.actor_id).filter((v): v is string => !!v))];

    const [{ data: meters }, { data: actors }] = await Promise.all([
      meterIds.length
        ? supabase.from("meters").select("id, meter_number, serial_number").in("id", meterIds)
        : Promise.resolve({ data: [] as { id: string; meter_number: string; serial_number: string }[] }),
      actorIds.length
        ? supabase.from("users").select("id, name, email").in("id", actorIds)
        : Promise.resolve({ data: [] as { id: string; name: string | null; email: string | null }[] }),
    ]);

    const meterMap = new Map((meters ?? []).map((m) => [m.id, m]));
    const actorMap = new Map((actors ?? []).map((a) => [a.id, a]));

    return {
      entries: relevant.map((log) => {
        const change = (log.changes as Record<string, { old?: unknown; new?: unknown }>)["vendor_id"]!;
        const meter = meterMap.get(log.meter_id);
        const actor = log.actor_id ? actorMap.get(log.actor_id) : null;
        return {
          id: log.id,
          meter_id: log.meter_id,
          meter_number: meter?.meter_number ?? "Deleted meter",
          serial_number: meter?.serial_number ?? null,
          action: change.new === data.vendorId ? ("assigned" as const) : ("unassigned" as const),
          actor_name: actor?.name ?? actor?.email ?? "System",
          created_at: log.created_at,
        };
      }),
    };
  });
