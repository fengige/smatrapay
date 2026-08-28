import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { COUNTRY_OPTIONS, STATE_MAP } from "@/lib/countries";

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
  property_type: z.enum(["building", "zone"], {
    required_error: "Property type is required",
    invalid_type_error: "Property type must be Building or Zone",
  }),
  building_category: z.enum(["residential", "commercial"]).nullable().optional(),
  subtype: text(60),
  number_of_units: z.number().int().min(0).max(100000).nullable().optional(),
  landlord_id: uuid.nullable().optional(),
})
  .superRefine((val, ctx) => {
    if (val.property_type === "building") {
      if (!val.building_category) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["building_category"],
          message: "Property type (Residential or Commercial) is required for buildings",
        });
      }
      if (!val.subtype?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["subtype"],
          message: "Please select a residential or commercial type",
        });
      }
    }
    if ((val.number_of_units ?? 0) > 0 && !val.landlord_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["landlord_id"],
        message: "A landlord is required when units are greater than 0",
      });
    }
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
  electricity_meter_no: text(60),
  water_meter_no: text(60),
  gas_meter_no: text(60),
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

export const listLandlordProperties = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ landlordId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabase } = context;

    const { data: properties, error } = await supabase
      .from("properties")
      .select("*")
      .eq("landlord_id", data.landlordId)
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);

    const ids = (properties ?? []).map((p) => p.id);
    const { data: units, error: unitsError } = ids.length
      ? await supabase.from("units").select("id, property_id, status").in("property_id", ids)
      : { data: [] as { id: string; property_id: string; status: string }[], error: null };
    if (unitsError) throw new Error(unitsError.message);

    return { properties: properties ?? [], units: units ?? [] };
  });

export const getProperty = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabase } = context;

    const { data: property, error } = await supabase
      .from("properties")
      .select("*, landlord:landlord_id (id, name, email, phone, status, profile_image)")
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

    return { property, landlord: property.landlord ?? null, units: units ?? [], assignments, people };
  });

export const getUnit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ unitId: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabase } = context;

    const { data: unit, error } = await supabase
      .from("units")
      .select("*")
      .eq("id", data.unitId)
      .single();
    if (error) throw new Error(error.message);
    if (!unit) throw new Error("Unit not found");

    const { data: property, error: pErr } = await supabase
      .from("properties")
      .select("id, name")
      .eq("id", unit.property_id)
      .single();
    if (pErr) throw new Error(pErr.message);

    const { data: assignments, error: aErr } = await supabase
      .from("unit_assignments")
      .select("*")
      .eq("unit_id", data.unitId)
      .order("start_date", { ascending: false });
    if (aErr) throw new Error(aErr.message);

    const userIds = [...new Set((assignments ?? []).map((a) => a.user_id))];
    let people: any[] = [];
    if (userIds.length) {
      const { data: rows, error: pplErr } = await supabase
        .from("users")
        .select("id, name, email, phone, status")
        .in("id", userIds);
      if (pplErr) throw new Error(pplErr.message);
      people = rows ?? [];
    }

    const { data: auditLogs, error: lErr } = await supabase
      .from("unit_audit_logs" as never)
      .select("id, actor_id, action, changes, created_at")
      .eq("unit_id", data.unitId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (lErr) throw new Error((lErr as { message: string }).message);

    const actorIds = [
      ...new Set(
        ((auditLogs ?? []) as { actor_id: string | null }[])
          .map((l) => l.actor_id)
          .filter((v): v is string => !!v),
      ),
    ];
    let actors: any[] = [];
    if (actorIds.length) {
      const { data: rows, error: actErr } = await supabase
        .from("users")
        .select("id, name, email")
        .in("id", actorIds);
      if (actErr) throw new Error(actErr.message);
      actors = rows ?? [];
    }

    return {
      unit,
      property,
      assignments: assignments ?? [],
      people,
      auditLogs: auditLogs ?? [],
      actors,
    };
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
  .inputValidator((data: unknown) =>
    z
      .object({
        id: uuid,
        name: z.string().trim().min(2).max(140).optional(),
        code: text(40),
        address_line1: text(200),
        address_line2: text(200),
        city: text(120),
        state: text(120),
        country: text(120),
        postal_code: text(30),
        description: text(2000),
        status: z.enum(["active", "archived"]).optional(),
        property_type: z.enum(["building", "zone"]).optional(),
        building_category: z.enum(["residential", "commercial"]).nullable().optional(),
        subtype: text(60),
        number_of_units: z.number().int().min(0).max(100000).nullable().optional(),
        landlord_id: uuid.nullable().optional(),
      })
      .superRefine((val, ctx) => {
        if (val.property_type === "building") {
          if (!val.building_category) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["building_category"],
              message: "Property type (Residential or Commercial) is required for buildings",
            });
          }
          if (!val.subtype?.trim()) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["subtype"],
              message: "Please select a residential or commercial type",
            });
          }
        }
        if ((val.number_of_units ?? 0) > 0 && !val.landlord_id) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["landlord_id"],
            message: "A landlord is required when units are greater than 0",
          });
        }
      })
      .parse(data),
  )
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

const bulkInput = z.object({
  property_id: uuid,
  count: z.number().int().min(1).max(500),
  start_number: z.number().int().min(0).max(1000000),
  prefix: text(60),
  unit_type: text(60),
  bedrooms: z.number().int().min(0).max(50).nullable().optional(),
  floor: text(30),
  status: z.enum(["vacant", "occupied", "maintenance", "archived"]).optional(),
  electricity_prefix: text(40),
  water_prefix: text(40),
  gas_prefix: text(40),
  mode: z.enum(["fail", "skip", "append"]).optional(),
});

const unitLabel = (prefix: string | null | undefined, n: number) =>
  prefix ? `${prefix} ${n}` : String(n);

function planBulk(
  input: { count: number; start_number: number; prefix?: string | null | undefined; mode?: string | undefined },
  existingNumbers: Set<string>,
) {
  const mode = input.mode ?? "fail";
  const planned: { number: number; unit_number: string }[] = [];
  const conflicts: string[] = [];

  if (mode === "append") {
    let n = input.start_number;
    while (planned.length < input.count) {
      const label = unitLabel(input.prefix, n);
      if (!existingNumbers.has(label)) planned.push({ number: n, unit_number: label });
      n += 1;
      if (n > input.start_number + input.count + 5000) break;
    }
    return { mode, planned, conflicts };
  }

  for (let i = 0; i < input.count; i++) {
    const n = input.start_number + i;
    const label = unitLabel(input.prefix, n);
    if (existingNumbers.has(label)) {
      conflicts.push(label);
      continue;
    }
    planned.push({ number: n, unit_number: label });
  }
  return { mode, planned, conflicts };
}

export const previewBulkUnits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => bulkInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { data: existing, error } = await context.supabase
      .from("units")
      .select("unit_number")
      .eq("property_id", data.property_id);
    if (error) throw new Error(error.message);
    const labels = (existing ?? []).map((u: any) => u.unit_number as string);
    const existingNumbers = new Set(labels);
    const plan = planBulk(data, existingNumbers);
    const appendPlan = planBulk({ ...data, mode: "append" }, existingNumbers);
    return {
      existingTotal: labels.length,
      conflicts: plan.conflicts,
      willCreate: plan.planned.length,
      firstLabel: plan.planned[0]?.unit_number ?? null,
      lastLabel: plan.planned[plan.planned.length - 1]?.unit_number ?? null,
      appendFirstLabel: appendPlan.planned[0]?.unit_number ?? null,
      appendLastLabel: appendPlan.planned[appendPlan.planned.length - 1]?.unit_number ?? null,
    };
  });

export const createBulkUnits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => bulkInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabase, userId } = context;

    const { data: existing, error: existingError } = await supabase
      .from("units")
      .select("unit_number")
      .eq("property_id", data.property_id);
    if (existingError) throw new Error(existingError.message);
    const existingNumbers = new Set((existing ?? []).map((u: any) => u.unit_number));

    const plan = planBulk(data, existingNumbers);
    if (plan.mode === "fail" && plan.conflicts.length) {
      throw new Error(
        `${plan.conflicts.length} unit number(s) already exist in this property (e.g. ${plan.conflicts
          .slice(0, 3)
          .join(", ")}). Choose to skip existing numbers or append after them.`,
      );
    }
    if (!plan.planned.length) {
      throw new Error("No new units to create — every generated number already exists.");
    }

    const status = data.status ?? "vacant";
    const rows = plan.planned.map(({ number, unit_number }) => ({
      property_id: data.property_id,
      unit_number,
      unit_type: data.unit_type ?? null,
      bedrooms: data.bedrooms ?? null,
      floor: data.floor ?? null,
      status,
      electricity_meter_no: data.electricity_prefix ? `${data.electricity_prefix}${number}` : null,
      water_meter_no: data.water_prefix ? `${data.water_prefix}${number}` : null,
      gas_meter_no: data.gas_prefix ? `${data.gas_prefix}${number}` : null,
      created_by: userId,
      updated_by: userId,
    }));

    const { error } = await supabase.from("units").insert(rows as never);
    if (error) throw new Error(error.message);
    return {
      created: rows.length,
      skipped: plan.conflicts.length,
      skippedNumbers: plan.conflicts.slice(0, 10),
      firstLabel: rows[0]?.unit_number ?? null,
      lastLabel: rows[rows.length - 1]?.unit_number ?? null,
    };
  });

export const updateUnitDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: uuid,
        unit_number: z.string().trim().min(1).max(40),
        building: text(120),
        unit_type: text(60),
        bedrooms: z.number().int().min(0).max(50).nullable().optional(),
        floor: text(30),
        status: z.enum(["vacant", "occupied", "maintenance", "archived"]),
        electricity_meter_no: text(60),
        water_meter_no: text(60),
        gas_meter_no: text(60),
        notes: text(1000),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabase, userId } = context;
    const { id, ...patch } = data;

    const { data: current, error: curErr } = await supabase
      .from("units")
      .select("property_id, unit_number")
      .eq("id", id)
      .single();
    if (curErr) throw new Error(curErr.message);
    if (!current) throw new Error("Unit not found");

    if (current.unit_number !== patch.unit_number) {
      const { data: dupe } = await supabase
        .from("units")
        .select("id")
        .eq("property_id", current.property_id)
        .eq("unit_number", patch.unit_number)
        .neq("id", id)
        .maybeSingle();
      if (dupe) throw new Error(`Unit ${patch.unit_number} already exists in this property`);
    }

    const { error } = await supabase
      .from("units")
      .update({ ...patch, updated_by: userId } as never)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
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
        /** Assignment the caller intends to replace; ended atomically before re-checking availability. */
        replace_assignment_id: uuid.optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabase, userId } = context;

    const today = new Date().toISOString().slice(0, 10);

    if (data.replace_assignment_id) {
      const { data: current, error: curErr } = await supabase
        .from("unit_assignments")
        .select("id, user_id, end_date")
        .eq("id", data.replace_assignment_id)
        .maybeSingle();
      if (curErr) throw new Error(curErr.message);
      if (!current) {
        throw new Error(
          "The assignment you are replacing no longer exists — reload the page and try again.",
        );
      }
      if (current.user_id !== data.user_id) {
        throw new Error("The assignment you are replacing belongs to a different person.");
      }
      if (!current.end_date) {
        const { error: endErr } = await supabase
          .from("unit_assignments")
          .update({ end_date: today, updated_by: userId } as never)
          .eq("id", data.replace_assignment_id)
          .is("end_date", null);
        if (endErr) throw new Error(endErr.message);
      }
    }

    const start = data.start_date ?? today;
    const end = data.end_date ?? null;
    if (end && end < start) throw new Error("End date must be on or after the start date");

    // Re-check availability at save time so a concurrent assignment cannot be overwritten.
    const { data: conflicting, error: cErr } = await supabase
      .from("unit_assignments")
      .select("id, user_id, start_date, end_date")
      .eq("unit_id", data.unit_id)
      .eq("role", data.role);
    if (cErr) throw new Error(cErr.message);
    const takenByOther = (conflicting ?? []).find(
      (row: any) =>
        row.user_id !== data.user_id &&
        overlaps(start, end, row.start_date ?? start, row.end_date ?? null),
    );
    if (takenByOther) {
      throw new Error(
        "This unit was just assigned to someone else. Reload the page and pick an available unit.",
      );
    }

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

export const listLandlords = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabase } = context;

    const { data: roles, error: rolesError } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "landlord");
    if (rolesError) throw new Error(rolesError.message);

    const ids = [...new Set((roles ?? []).map((r) => r.user_id))];
    if (!ids.length) return { landlords: [] as { id: string; name: string | null; email: string | null }[] };

    const { data: users, error } = await supabase
      .from("users")
      .select("id, name, email")
      .in("id", ids)
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);

    return { landlords: users ?? [] };
  });

/** Audit trail of unit-assignment changes for a resident (who changed what, and old/new unit). */
export const listAssignmentAuditLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ userId: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabase } = context;

    const { data: logs, error } = await supabase
      .from("assignment_audit_logs" as never)
      .select("id, assignment_id, user_id, actor_id, action, old_unit_id, new_unit_id, changes, created_at")
      .eq("user_id", data.userId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error((error as { message: string }).message);

    const rows = (logs ?? []) as {
      id: string;
      actor_id: string | null;
      action: string;
      old_unit_id: string | null;
      new_unit_id: string | null;
      changes: Record<string, unknown>;
      created_at: string;
    }[];

    const unitIds = [
      ...new Set(rows.flatMap((l) => [l.old_unit_id, l.new_unit_id]).filter((v): v is string => !!v)),
    ];
    let units: any[] = [];
    let properties: any[] = [];
    if (unitIds.length) {
      const { data: u, error: uErr } = await supabase
        .from("units")
        .select("id, unit_number, property_id")
        .in("id", unitIds);
      if (uErr) throw new Error(uErr.message);
      units = u ?? [];
      const propIds = [...new Set(units.map((x) => x.property_id))];
      if (propIds.length) {
        const { data: p, error: pErr } = await supabase
          .from("properties")
          .select("id, name")
          .in("id", propIds);
        if (pErr) throw new Error(pErr.message);
        properties = p ?? [];
      }
    }

    const actorIds = [...new Set(rows.map((l) => l.actor_id).filter((v): v is string => !!v))];
    let actors: any[] = [];
    if (actorIds.length) {
      const { data: a, error: aErr } = await supabase
        .from("users")
        .select("id, name, email")
        .in("id", actorIds);
      if (aErr) throw new Error(aErr.message);
      actors = a ?? [];
    }

    const propName = new Map(properties.map((p) => [p.id, p.name as string]));
    const unitLabel = (unitId: string | null) => {
      if (!unitId) return null;
      const u = units.find((x) => x.id === unitId);
      if (!u) return "Unknown unit";
      const prop = propName.get(u.property_id);
      return prop ? `${prop} · Unit ${u.unit_number}` : `Unit ${u.unit_number}`;
    };
    const actorName = (actorId: string | null) => {
      if (!actorId) return "System";
      const a = actors.find((x) => x.id === actorId);
      return a?.name || a?.email || `user ${actorId.slice(0, 8)}`;
    };

    return {
      logs: rows.map((l) => ({
        id: l.id,
        action: l.action,
        created_at: l.created_at,
        actor: actorName(l.actor_id) as string,
        old_unit: unitLabel(l.old_unit_id),
        new_unit: unitLabel(l.new_unit_id),
        changed_fields: Object.keys(l.changes ?? {}) as string[],
      })),
    };
  });

const meterInput = z.object({
  unit_id: uuid,
  type: z.enum(["electricity", "water", "gas"]),
  serial: z.string().trim().min(1).max(60),
});

export const addMeter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => meterInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabase, userId } = context;

    const { data: unit, error: unitError } = await supabase
      .from("units")
      .select("id")
      .eq("id", data.unit_id)
      .maybeSingle();
    if (unitError) throw new Error(unitError.message);
    if (!unit) throw new Error("Unit not found");

    const column = `${data.type}_meter_no` as "electricity_meter_no" | "water_meter_no" | "gas_meter_no";
    const { error } = await supabase
      .from("units")
      .update({ [column]: data.serial, updated_by: userId } as never)
      .eq("id", data.unit_id);
    if (error) throw new Error(error.message);

    return { ok: true };
  });

const bulkMeterInput = z.object({
  action: z.enum(["delete", "deactivate", "activate"]),
  meters: z
    .array(z.object({ unit_id: uuid, type: z.enum(["electricity", "water", "gas"]) }))
    .min(1)
    .max(500),
});

/** Delete / deactivate / activate many meters at once. */
export const bulkMeterAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => bulkMeterInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabase, userId } = context;

    // Group all changes per unit so each unit is updated once.
    const perUnit = new Map<string, Record<string, unknown>>();
    for (const m of data.meters) {
      const patch = perUnit.get(m.unit_id) ?? {};
      if (data.action === "delete") {
        patch[`${m.type}_meter_no`] = null;
        patch[`${m.type}_meter_active`] = true;
      } else {
        patch[`${m.type}_meter_active`] = data.action === "activate";
      }
      perUnit.set(m.unit_id, patch);
    }

    let affected = 0;
    for (const [unitId, patch] of perUnit) {
      const { error } = await supabase
        .from("units")
        .update({ ...patch, updated_by: userId } as never)
        .eq("id", unitId);
      if (error) throw new Error(error.message);
      affected += 1;
    }

    return { ok: true, meters: data.meters.length, units: affected };
  });

/** All meters across units, with property and landlord context. */


export const listMeters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabase } = context;

    const { data: units, error } = await supabase
      .from("units")
      .select(
        "id, property_id, unit_number, unit_type, floor, status, electricity_meter_no, water_meter_no, gas_meter_no, electricity_meter_active, water_meter_active, gas_meter_active",
      )
      .order("unit_number", { ascending: true });
    if (error) throw new Error(error.message);

    const propIds = [...new Set((units ?? []).map((u) => u.property_id))];
    let properties: any[] = [];
    if (propIds.length) {
      const { data: p, error: pErr } = await supabase
        .from("properties")
        .select("id, name, landlord_id")
        .in("id", propIds);
      if (pErr) throw new Error(pErr.message);
      properties = p ?? [];
    }

    const landlordIds = [
      ...new Set(properties.map((p) => p.landlord_id).filter((v): v is string => !!v)),
    ];
    let landlords: any[] = [];
    if (landlordIds.length) {
      const { data: l, error: lErr } = await supabase
        .from("users")
        .select("id, name, email")
        .in("id", landlordIds);
      if (lErr) throw new Error(lErr.message);
      landlords = l ?? [];
    }

    const propById = new Map(properties.map((p) => [p.id, p]));
    const landlordById = new Map(landlords.map((l) => [l.id, l]));

    type Meter = {
      key: string;
      unit_id: string;
      unit_number: string;
      unit_status: string;
      property_id: string;
      property_name: string;
      landlord_name: string | null;
      type: "electricity" | "water" | "gas";
      serial: string;
      active: boolean;
    };

    const meters: Meter[] = [];
    for (const u of units ?? []) {
      const prop = propById.get(u.property_id);
      const landlord = prop?.landlord_id ? landlordById.get(prop.landlord_id) : null;
      const base = {
        unit_id: u.id,
        unit_number: u.unit_number,
        unit_status: u.status as string,
        property_id: u.property_id,
        property_name: (prop?.name as string) ?? "—",
        landlord_name: (landlord?.name as string) ?? (landlord?.email as string) ?? null,
      };
      const anyUnit = u as unknown as Record<string, unknown>;
      const entries: [Meter["type"], string | null, boolean][] = [
        ["electricity", u.electricity_meter_no, anyUnit["electricity_meter_active"] !== false],
        ["water", u.water_meter_no, anyUnit["water_meter_active"] !== false],
        ["gas", u.gas_meter_no, anyUnit["gas_meter_active"] !== false],
      ];
      for (const [type, serial, active] of entries) {
        if (serial && String(serial).trim()) {
          meters.push({ ...base, key: `${u.id}-${type}`, type, serial: String(serial).trim(), active });
        }
      }
    }

    return { meters, properties, units: units ?? [] };
  });

