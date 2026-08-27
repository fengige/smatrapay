import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();
const text = (max: number) => z.string().trim().max(max).nullable().optional();
const dateStr = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/);

const propertyInput = z.object({
  name: z.string().trim().min(2).max(140),
  code: text(40),
  address_line1: text(200),
  address_line2: text(200),
  city: text(120),
  state: text(120),
  country: text(120),
  postal_code: text(30),
  description: text(2000),
  status: z.enum(["active", "archived"]).optional(),
});

const unitInput = z.object({
  property_id: uuid,
  unit_number: z.string().trim().min(1).max(40),
  building: text(120),
  unit_type: text(60),
  bedrooms: z.number().int().min(0).max(50).nullable().optional(),
  floor: text(30),
  status: z.enum(["vacant", "occupied", "maintenance", "archived"]).optional(),
  notes: text(1000),
});

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Admin access required");
}

export const listProperties = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabase } = context;

    const { data: properties, error } = await supabase
      .from("properties")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);

    const { data: units, error: unitsError } = await supabase.from("units").select("*");
    if (unitsError) throw new Error(unitsError.message);

    const { data: assignments, error: aErr } = await supabase
      .from("unit_assignments")
      .select("id, unit_id, user_id, role, start_date, end_date");
    if (aErr) throw new Error(aErr.message);

    return { properties: properties ?? [], units: units ?? [], assignments: assignments ?? [] };
  });

export const getProperty = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabase } = context;

    const { data: property, error } = await supabase
      .from("properties")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!property) throw new Error("Property not found");

    const { data: units, error: unitsError } = await supabase
      .from("units")
      .select("*")
      .eq("property_id", data.id)
      .order("unit_number", { ascending: true });
    if (unitsError) throw new Error(unitsError.message);

    const unitIds = (units ?? []).map((u) => u.id);
    let assignments: any[] = [];
    if (unitIds.length) {
      const { data: rows, error: aErr } = await supabase
        .from("unit_assignments")
        .select("*")
        .in("unit_id", unitIds)
        .order("start_date", { ascending: false });
      if (aErr) throw new Error(aErr.message);
      assignments = rows ?? [];
    }

    const userIds = [...new Set(assignments.map((a) => a.user_id))];
    let people: any[] = [];
    if (userIds.length) {
      const { data: rows, error: pErr } = await supabase
        .from("users")
        .select("id, name, email, phone, status, profile_image")
        .in("id", userIds);
      if (pErr) throw new Error(pErr.message);
      people = rows ?? [];
    }

    return { property, units: units ?? [], assignments, people };
  });

export const createProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => propertyInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("properties")
      .insert({ ...data, created_by: userId, updated_by: userId } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const updateProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => propertyInput.partial().extend({ id: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabase, userId } = context;
    const { id, ...patch } = data;
    const { error } = await supabase
      .from("properties")
      .update({ ...patch, updated_by: userId } as never)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { error } = await context.supabase.from("properties").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const upsertUnit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => unitInput.extend({ id: uuid.optional() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabase, userId } = context;
    const { id, ...patch } = data;
    if (id) {
      const { error } = await supabase
        .from("units")
        .update({ ...patch, updated_by: userId } as never)
        .eq("id", id);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { data: row, error } = await supabase
      .from("units")
      .insert({ ...patch, created_by: userId, updated_by: userId } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteUnit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { error } = await context.supabase.from("units").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const assignUnit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        unit_id: uuid,
        user_id: uuid,
        role: z.enum(["resident", "landlord"]),
        start_date: dateStr.optional(),
        notes: text(500),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabase, userId } = context;

    const { error } = await supabase.from("unit_assignments").insert({
      unit_id: data.unit_id,
      user_id: data.user_id,
      role: data.role,
      start_date: data.start_date ?? new Date().toISOString().slice(0, 10),
      notes: data.notes ?? null,
      created_by: userId,
      updated_by: userId,
    } as never);
    if (error) throw new Error(error.message);

    if (data.role === "resident") {
      await supabase.from("units").update({ status: "occupied" } as never).eq("id", data.unit_id);
    }
    return { ok: true };
  });

export const endAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: uuid, end_date: dateStr.optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("unit_assignments")
      .update({
        end_date: data.end_date ?? new Date().toISOString().slice(0, 10),
        updated_by: userId,
      } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { error } = await context.supabase.from("unit_assignments").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listAssignableUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabase } = context;

    const { data: roles, error: rolesError } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["resident", "landlord"]);
    if (rolesError) throw new Error(rolesError.message);

    const ids = [...new Set((roles ?? []).map((r) => r.user_id))];
    if (!ids.length) return { people: [] as any[] };

    const { data: users, error } = await supabase
      .from("users")
      .select("id, name, email, phone, status")
      .in("id", ids)
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);

    const roleById = new Map<string, string>();
    for (const r of roles ?? []) if (!roleById.has(r.user_id)) roleById.set(r.user_id, r.role);

    return {
      people: (users ?? []).map((u) => ({ ...u, role: roleById.get(u.id) ?? "resident" })),
    };
  });
