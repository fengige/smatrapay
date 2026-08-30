import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createUserSchema } from "@/lib/user-schema";
import { assignmentHistorySchema } from "@/lib/assignment-history";


/** Agents never carry residency details, so those fields are dropped entirely. */
const agentCreateSchema = createUserSchema.omit({
  property: true,
  building: true,
  unit_number: true,
  move_in_date: true,
  role: true,
});

const agentUpdateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().max(120).nullable().optional(),
  username: z.string().trim().max(60).nullable().optional(),
  email: z.string().trim().email().max(255).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  bio: z.string().trim().max(1000).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  status: z.enum(["active", "inactive", "suspended", "pending"]).optional(),
  profile_image: z.string().trim().max(1000).nullable().optional(),
});

export const createAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => agentCreateSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Only admins can create agents");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { name: data.name },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Could not create agent");

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
      .insert({ user_id: id, role: "agent" });
    if (roleError) throw new Error(roleError.message);

    return { ok: true, id };
  });

export const updateAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => agentUpdateSchema.parse(data))
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

/** Meters registered under a agent account. */
export const listAgentMeters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ agentId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: meters, error } = await context.supabase
      .from("meters")
      .select("id, meter_number, serial_number, type, price_per_unit, status, unit_id, created_at")
      .eq("agent_id", data.agentId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { meters: meters ?? [] };
  });

const assignableFilterSchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.string().trim().max(40).optional(),
  type: z.string().trim().max(60).optional(),
});

/** Meters that are not yet registered to any agent (available for assignment). */
export const listAssignableAgentMeters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => assignableFilterSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("meters")
      .select("id, meter_number, serial_number, type, status, landlord_id, agent_id, vendor_id")
      .is("agent_id", null)
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
  agentId: z.string().uuid(),
  meterIds: z.array(z.string().uuid()).min(1).max(500),
});

type MeterResult = {
  id: string;
  meter_number: string;
  ok: boolean;
  reason?: string;
};

async function runAssignment(
  supabase: { rpc: (fn: "apply_meter_assignment", args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> },
  action: "assign" | "unassign",
  agentId: string,
  meterIds: string[],
): Promise<MeterResult[]> {
  const { data, error } = await supabase.rpc("apply_meter_assignment", {
    p_holder: "agent",
    p_holder_id: agentId,
    p_meter_ids: meterIds,
    p_action: action,
  });
  if (error) throw new Error(error.message);
  const raw = (data as { results?: MeterResult[] } | null)?.results ?? [];
  const order = new Map(meterIds.map((id, index) => [id, index]));
  return [...raw].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

/** Register selected meters to an agent inside a locked transaction. */
export const assignMetersToAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => assignSchema.parse(data))
  .handler(async ({ data, context }) => {
    const results = await runAssignment(context.supabase, "assign", data.agentId, data.meterIds);
    return {
      ok: true,
      assigned: results.filter((r) => r.ok).length,
      skipped: results.filter((r) => !r.ok).map((r) => r.meter_number),
      results,
    };
  });

/** Remove the agent registration from selected meters inside a locked transaction. */
export const unassignMetersFromAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => assignSchema.parse(data))
  .handler(async ({ data, context }) => {
    const results = await runAssignment(context.supabase, "unassign", data.agentId, data.meterIds);
    if (!results.some((r) => r.ok)) {
      throw new Error(results[0]?.reason ?? "No eligible meters to unassign");
    }
    return { ok: true, unassigned: results.filter((r) => r.ok).length, results };
  });

/** Assignment history: who registered/unassigned which meter to this agent and when. */
export const listAgentAssignmentHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => assignmentHistorySchema.parse(data))
  .handler(async ({ data, context }) => {
    const { buildAssignmentHistory } = await import("@/lib/assignment-history.server");
    return buildAssignmentHistory(context.supabase, "agent_id", data);
  });

