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

function overlaps(
  aStart: string,
  aEnd: string | null,
  bStart: string,
  bEnd: string | null,
) {
  const aE = aEnd ?? "9999-12-31";
  const bE = bEnd ?? "9999-12-31";
  return aStart <= bE && bStart <= aE;
}

async function assertNoOverlap(
  supabase: any,
  input: {
    unit_id: string;
    role: string;
    start_date: string;
    end_date: string | null;
    ignoreId?: string;
  },
  unitLabel?: string,
) {
  const { data: existing, error } = await supabase
    .from("unit_assignments")
    .select("id, start_date, end_date, role")
    .eq("unit_id", input.unit_id)
    .eq("role", input.role);
  if (error) throw new Error(error.message);

  const clash = (existing ?? []).find(
    (row: any) =>
      row.id !== input.ignoreId &&
      overlaps(input.start_date, input.end_date, row.start_date, row.end_date),
  );
  if (clash) {
    throw new Error(
      `Overlapping ${input.role} assignment${unitLabel ? ` for unit ${unitLabel}` : ""}: existing period ${clash.start_date} – ${clash.end_date ?? "open"} conflicts with ${input.start_date} – ${input.end_date ?? "open"}.`,
    );
  }
}

export const assignUnit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        unit_id: uuid,
        user_id: uuid,
        role: z.enum(["resident", "landlord"]),
        start_date: dateStr.optional(),
        end_date: dateStr.nullable().optional(),
        notes: text(500),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabase, userId } = context;

    const start = data.start_date ?? new Date().toISOString().slice(0, 10);
    const end = data.end_date ?? null;
    if (end && end < start) throw new Error("End date must be on or after the start date");

    await assertNoOverlap(supabase, {
      unit_id: data.unit_id,
      role: data.role,
      start_date: start,
      end_date: end,
    });

    const { error } = await supabase.from("unit_assignments").insert({
      unit_id: data.unit_id,
      user_id: data.user_id,
      role: data.role,
      start_date: start,
      end_date: end,
      notes: data.notes ?? null,
      created_by: userId,
      updated_by: userId,
    } as never);
    if (error) throw new Error(error.message);

    if (data.role === "resident" && !end) {
      await supabase.from("units").update({ status: "occupied" } as never).eq("id", data.unit_id);
    }
    return { ok: true };
  });

const importRow = z.object({
  unit_number: z.string().trim().min(1).max(40),
  building: z.string().trim().max(120).optional().nullable(),
  role: z.enum(["resident", "landlord"]),
  identifier: z.string().trim().min(1).max(200),
  start_date: dateStr,
  end_date: dateStr.nullable().optional(),
  notes: text(500),
});

export const importAssignments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        property_id: uuid,
        dryRun: z.boolean().optional(),
        rows: z.array(z.unknown()).min(1).max(500),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabase, userId } = context;

    const { data: units, error: unitsError } = await supabase
      .from("units")
      .select("id, unit_number, building")
      .eq("property_id", data.property_id);
    if (unitsError) throw new Error(unitsError.message);

    const { data: people, error: peopleError } = await supabase
      .from("users")
      .select("id, email, phone, name");
    if (peopleError) throw new Error(peopleError.message);

    const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();
    const findUnit = (unitNumber: string, building?: string | null) =>
      (units ?? []).find(
        (u: any) =>
          norm(u.unit_number) === norm(unitNumber) &&
          (!building?.trim() || norm(u.building) === norm(building)),
      );
    const findPerson = (identifier: string) =>
      (people ?? []).find(
        (p: any) =>
          norm(p.email) === norm(identifier) ||
          norm(p.phone) === norm(identifier) ||
          p.id === identifier.trim(),
      );

    // pending rows staged per unit+role so intra-file overlaps are caught too
    const staged = new Map<string, { start_date: string; end_date: string | null }[]>();
    const results: {
      line: number;
      ok: boolean;
      message: string;
      insert?: Record<string, unknown>;
    }[] = [];

    data.rows.forEach((raw, index) => {
      const line = index + 1;
      const parsed = importRow.safeParse(raw);
      if (!parsed.success) {
        results.push({
          line,
          ok: false,
          message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        });
        return;
      }
      const row = parsed.data;
      const unit = findUnit(row.unit_number, row.building);
      if (!unit) {
        results.push({ line, ok: false, message: `Unit "${row.unit_number}" not found in this property` });
        return;
      }
      const person = findPerson(row.identifier);
      if (!person) {
        results.push({ line, ok: false, message: `No user matched "${row.identifier}"` });
        return;
      }
      const end = row.end_date ?? null;
      if (end && end < row.start_date) {
        results.push({ line, ok: false, message: "End date is before the start date" });
        return;
      }
      const key = `${unit.id}:${row.role}`;
      const pending = staged.get(key) ?? [];
      if (pending.some((p) => overlaps(row.start_date, end, p.start_date, p.end_date))) {
        results.push({
          line,
          ok: false,
          message: `Overlaps another row in this file for unit ${row.unit_number} (${row.role})`,
        });
        return;
      }
      pending.push({ start_date: row.start_date, end_date: end });
      staged.set(key, pending);

      results.push({
        line,
        ok: true,
        message: `${person.name || person.email || person.id} → unit ${unit.unit_number} (${row.role})`,
        insert: {
          unit_id: unit.id,
          user_id: person.id,
          role: row.role,
          start_date: row.start_date,
          end_date: end,
          notes: row.notes ?? null,
          created_by: userId,
          updated_by: userId,
        },
      });
    });

    // validate against existing DB rows
    for (const result of results) {
      if (!result.ok || !result.insert) continue;
      try {
        await assertNoOverlap(supabase, {
          unit_id: result.insert["unit_id"] as string,
          role: result.insert["role"] as string,
          start_date: result.insert["start_date"] as string,
          end_date: (result.insert["end_date"] as string | null) ?? null,
        });
      } catch (err) {
        result.ok = false;
        result.message = (err as Error).message;
        delete result.insert;
      }
    }

    const valid = results.filter((r) => r.ok && r.insert);
    if (!data.dryRun && valid.length) {
      const { error } = await supabase
        .from("unit_assignments")
        .insert(valid.map((r) => r.insert) as never);
      if (error) throw new Error(error.message);

      const occupyIds = [
        ...new Set(
          valid
            .filter((r) => r.insert!["role"] === "resident" && !r.insert!["end_date"])
            .map((r) => r.insert!["unit_id"] as string),
        ),
      ];
      if (occupyIds.length) {
        await supabase.from("units").update({ status: "occupied" } as never).in("id", occupyIds);
      }
    }

    return {
      dryRun: Boolean(data.dryRun),
      imported: data.dryRun ? 0 : valid.length,
      valid: valid.length,
      failed: results.length - valid.length,
      results: results.map(({ line, ok, message }) => ({ line, ok, message })),
    };
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

export const listUserAssignments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ userId: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabase } = context;

    const { data: assignments, error } = await supabase
      .from("unit_assignments")
      .select("id, unit_id, role, start_date, end_date, notes, created_at")
      .eq("user_id", data.userId)
      .order("start_date", { ascending: false });
    if (error) throw new Error(error.message);

    const unitIds = [...new Set((assignments ?? []).map((a) => a.unit_id))];
    let units: any[] = [];
    if (unitIds.length) {
      const { data: rows, error: uErr } = await supabase
        .from("units")
        .select("id, property_id, unit_number, building, unit_type, status")
        .in("id", unitIds);
      if (uErr) throw new Error(uErr.message);
      units = rows ?? [];
    }

    const propertyIds = [...new Set(units.map((u) => u.property_id))];
    let properties: any[] = [];
    if (propertyIds.length) {
      const { data: rows, error: pErr } = await supabase
        .from("properties")
        .select("id, name, code, city, status")
        .in("id", propertyIds);
      if (pErr) throw new Error(pErr.message);
      properties = rows ?? [];
    }

    return { assignments: assignments ?? [], units, properties };
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
