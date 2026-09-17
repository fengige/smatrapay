import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Admin access required");
}

export type VendingSoftwareRow = {
  id: string;
  name: string;
  code: string | null;
  version: string | null;
  description: string | null;
  logo_url: string | null;
  status: string;
  archived_at: string | null;
  meter_count: number;
  created_at: string;
  updated_at: string;
};

export type VendingSoftwareMeterRow = {
  id: string;
  meter_number: string;
  serial_number: string;
  type: string;
  status: string;
  supplier_name: string | null;
  property_name: string | null;
  unit_number: string | null;
  zone_name: string | null;
  landlord_name: string | null;
  resident_name: string | null;
  installation_date: string | null;
  last_reading: number | null;
  last_communication: string | null;
  assigned_at: string;
};

export type VendingSoftwareAuditRow = {
  id: string;
  action: string;
  previous_status: string | null;
  new_status: string | null;
  reason: string | null;
  changes: Record<string, string | number | boolean | null>;
  actor_name: string | null;
  meter_number: string | null;
  created_at: string;
};

export type VendingSoftwareUsage = {
  total: number;
  activeMeters: number;
  inactiveMeters: number;
  byType: { label: string; count: number }[];
  bySupplier: { label: string; count: number }[];
  byZone: { label: string; count: number }[];
};

export type VendingSoftwareDetail = VendingSoftwareRow & {
  created_by_name: string | null;
  updated_by_name: string | null;
  meters: VendingSoftwareMeterRow[];
  usage: VendingSoftwareUsage;
  history: VendingSoftwareAuditRow[];
};

const SOFTWARE_COLUMNS =
  "vending_software_id, name, code, version, description, logo_url, status, archived_at, created_by, updated_by, created_at, updated_at";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null));

const softwareInput = z.object({
  name: z.string().trim().min(2, "Software name is required").max(150),
  code: z
    .string()
    .trim()
    .min(2, "Software code is required")
    .max(50)
    .transform((v) => v.toUpperCase()),
  version: optionalText(50),
  description: optionalText(1000),
  logo_url: optionalText(2000),
  status: z.enum(["active", "inactive"]).default("active"),
});

function mapRow(r: any, meterCount: number): VendingSoftwareRow {
  return {
    id: r.vending_software_id,
    name: r.name ?? "",
    code: r.code ?? null,
    version: r.version ?? null,
    description: r.description ?? null,
    logo_url: r.logo_url ?? null,
    status: String(r.status ?? "active").toLowerCase(),
    archived_at: r.archived_at ?? null,
    meter_count: meterCount,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

async function logEvent(
  supabase: any,
  payload: {
    vending_software_id: string | null;
    software_name: string | null;
    actor_id: string;
    action: string;
    previous_status?: string | null;
    new_status?: string | null;
    reason?: string | null;
    changes?: Record<string, unknown>;
  },
) {
  await supabase.from("vending_software_audit_logs").insert({
    vending_software_id: payload.vending_software_id,
    software_name: payload.software_name,
    actor_id: payload.actor_id,
    action: payload.action,
    previous_status: payload.previous_status ?? null,
    new_status: payload.new_status ?? null,
    reason: payload.reason ?? null,
    changes: payload.changes ?? {},
  } as never);
}

/** All vending software records with live meter counts. */
export const listVendingSoftware = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabase } = context;

    const { data: rows, error } = await supabase
      .from("vending_software")
      .select(SOFTWARE_COLUMNS)
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);

    const { data: meterRows } = await supabase.from("meters").select("vending_software_id");
    const counts = new Map<string, number>();
    let unassigned = 0;
    for (const m of (meterRows ?? []) as any[]) {
      if (!m.vending_software_id) {
        unassigned += 1;
        continue;
      }
      counts.set(m.vending_software_id, (counts.get(m.vending_software_id) ?? 0) + 1);
    }

    const software = (rows ?? []).map((r: any) => mapRow(r, counts.get(r.vending_software_id) ?? 0));

    return {
      software,
      stats: {
        total: software.length,
        active: software.filter((s) => s.status === "active").length,
        inactive: software.filter((s) => s.status !== "active").length,
        assignedMeters: (meterRows ?? []).length - unassigned,
        unassignedMeters: unassigned,
      },
    };
  });

export const addVendingSoftware = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => softwareInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabase, userId } = context;

    const { data: inserted, error } = await supabase
      .from("vending_software")
      .insert({ ...data, created_by: userId, updated_by: userId } as never)
      .select("vending_software_id")
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("That software code is already in use");
      throw new Error(error.message);
    }

    await logEvent(supabase, {
      vending_software_id: inserted?.vending_software_id as string,
      software_name: data.name,
      actor_id: userId,
      action: "created",
      new_status: data.status,
      changes: data as never,
    });

    return { ok: true, id: inserted?.vending_software_id as string };
  });

export const updateVendingSoftware = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => softwareInput.extend({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabase, userId } = context;
    const { id, ...values } = data;

    const { data: before } = await supabase
      .from("vending_software")
      .select("name, status")
      .eq("vending_software_id", id)
      .maybeSingle();

    const { error } = await supabase
      .from("vending_software")
      .update({ ...values, updated_by: userId } as never)
      .eq("vending_software_id", id);
    if (error) {
      if (error.code === "23505") throw new Error("That software code is already in use");
      throw new Error(error.message);
    }

    await logEvent(supabase, {
      vending_software_id: id,
      software_name: values.name,
      actor_id: userId,
      action: "updated",
      previous_status: (before?.status as string) ?? null,
      new_status: values.status,
      changes: values as never,
    });

    return { ok: true };
  });

export const setVendingSoftwareStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ id: uuid, status: z.enum(["active", "inactive"]), reason: optionalText(500) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabase, userId } = context;

    const { data: before } = await supabase
      .from("vending_software")
      .select("name, status")
      .eq("vending_software_id", data.id)
      .maybeSingle();
    if (!before) throw new Error("Vending software not found");

    const { error } = await supabase
      .from("vending_software")
      .update({ status: data.status, updated_by: userId } as never)
      .eq("vending_software_id", data.id);
    if (error) throw new Error(error.message);

    await logEvent(supabase, {
      vending_software_id: data.id,
      software_name: (before.name as string) ?? null,
      actor_id: userId,
      action: data.status === "active" ? "activated" : "deactivated",
      previous_status: (before.status as string) ?? null,
      new_status: data.status,
      reason: data.reason ?? null,
    });

    return { ok: true };
  });

/**
 * Archives a vending software record. Meters keep their relationship, so
 * software still in use is never destructively deleted.
 */
export const archiveVendingSoftware = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid, reason: optionalText(500) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabase, userId } = context;

    const { data: before } = await supabase
      .from("vending_software")
      .select("name, status")
      .eq("vending_software_id", data.id)
      .maybeSingle();
    if (!before) throw new Error("Vending software not found");

    const { count } = await supabase
      .from("meters")
      .select("id", { count: "exact", head: true })
      .eq("vending_software_id", data.id);

    if ((count ?? 0) > 0) {
      throw new Error(
        `This vending software is currently assigned to ${count} meter${count === 1 ? "" : "s"} and cannot be permanently deleted. Deactivate it instead.`,
      );
    }

    const { error } = await supabase
      .from("vending_software")
      .update({ status: "archived", archived_at: new Date().toISOString(), updated_by: userId } as never)
      .eq("vending_software_id", data.id);
    if (error) throw new Error(error.message);

    await logEvent(supabase, {
      vending_software_id: data.id,
      software_name: (before.name as string) ?? null,
      actor_id: userId,
      action: "archived",
      previous_status: (before.status as string) ?? null,
      new_status: "archived",
      reason: data.reason ?? null,
    });

    return { ok: true };
  });

/**
 * Moves existing meters from one vending software to another (or clears the
 * assignment). Only active software may receive new assignments; the meters
 * themselves are never deleted and every move is recorded in the audit trail.
 */
export const reassignMetersVendingSoftware = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        meterIds: z.array(uuid).min(1),
        targetSoftwareId: uuid.nullable(),
        reason: optionalText(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabase, userId } = context;

    let target: { vending_software_id: string; name: string; status: string } | null = null;
    if (data.targetSoftwareId) {
      const { data: row } = await supabase
        .from("vending_software")
        .select("vending_software_id, name, status")
        .eq("vending_software_id", data.targetSoftwareId)
        .maybeSingle();
      if (!row) throw new Error("Vending software not found");
      target = row as never;
      if (target!.status !== "active") {
        throw new Error("Only active vending software can receive meter assignments");
      }
    }

    const { data: meters, error: meterError } = await supabase
      .from("meters")
      .select("id, meter_number, vending_software_id")
      .in("id", data.meterIds);
    if (meterError) throw new Error(meterError.message);
    if (!meters || meters.length !== data.meterIds.length) {
      throw new Error("One or more meters could not be found");
    }

    const { error } = await supabase
      .from("meters")
      .update({ vending_software_id: data.targetSoftwareId } as never)
      .in("id", data.meterIds);
    if (error) throw new Error(error.message);

    const sourceIds = [
      ...new Set((meters as any[]).map((m) => m.vending_software_id).filter(Boolean)),
    ] as string[];
    const nameById = new Map<string, string>();
    if (sourceIds.length) {
      const { data: sources } = await supabase
        .from("vending_software")
        .select("vending_software_id, name")
        .in("vending_software_id", sourceIds);
      for (const s of (sources ?? []) as any[]) nameById.set(s.vending_software_id, s.name);
    }

    const numbers = (meters as any[]).map((m) => m.meter_number);
    const reason =
      data.reason ??
      `${numbers.length} meter${numbers.length === 1 ? "" : "s"} reassigned: ${numbers.slice(0, 10).join(", ")}${
        numbers.length > 10 ? "…" : ""
      }`;

    for (const sourceId of sourceIds) {
      if (sourceId === data.targetSoftwareId) continue;
      await logEvent(supabase, {
        vending_software_id: sourceId,
        software_name: nameById.get(sourceId) ?? null,
        actor_id: userId,
        action: "meters_reassigned_out",
        reason,
        changes: { to: target?.name ?? "Unassigned", meters: numbers },
      });
    }

    if (data.targetSoftwareId) {
      await logEvent(supabase, {
        vending_software_id: data.targetSoftwareId,
        software_name: target?.name ?? null,
        actor_id: userId,
        action: "meters_reassigned_in",
        reason,
        changes: {
          from: sourceIds.map((s) => nameById.get(s) ?? "Unassigned").join(", ") || "Unassigned",
          meters: numbers,
        },
      });
    }

    return { ok: true, moved: numbers.length, target: target?.name ?? null };
  });

/** One vending software record with its meters, usage summary and history. */
export const getVendingSoftware = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabase } = context;

    const { data: row, error } = await supabase
      .from("vending_software")
      .select(SOFTWARE_COLUMNS)
      .eq("vending_software_id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Vending software not found");

    const { data: meterRows, error: mErr } = await supabase
      .from("meters")
      .select(
        "id, meter_number, serial_number, type, status, supplier_id, unit_id, landlord_id, installation_date, updated_at, created_at",
      )
      .eq("vending_software_id", data.id)
      .order("created_at", { ascending: false });
    if (mErr) throw new Error(mErr.message);

    const meterList = (meterRows ?? []) as any[];
    const unitIds = [...new Set(meterList.map((m) => m.unit_id).filter(Boolean))] as string[];
    const supplierIds = [...new Set(meterList.map((m) => m.supplier_id).filter(Boolean))] as string[];
    const meterIds = meterList.map((m) => m.id as string);

    const [unitsRes, suppliersRes, readingsRes] = await Promise.all([
      unitIds.length
        ? supabase.from("units").select("id, unit_number, property_id").in("id", unitIds)
        : Promise.resolve({ data: [] as any[] }),
      supplierIds.length
        ? supabase.from("meter_suppliers").select("id, company_name").in("id", supplierIds)
        : Promise.resolve({ data: [] as any[] }),
      meterIds.length
        ? supabase
            .from("meter_readings")
            .select("meter_id, reading, reading_date, created_at")
            .in("meter_id", meterIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const units = new Map((unitsRes.data ?? []).map((u: any) => [u.id, u]));
    const suppliers = new Map((suppliersRes.data ?? []).map((s: any) => [s.id, s.company_name]));

    const propertyIds = [
      ...new Set((unitsRes.data ?? []).map((u: any) => u.property_id).filter(Boolean)),
    ] as string[];
    const { data: propertyRows } = propertyIds.length
      ? await supabase.from("properties").select("id, name, zone_id, landlord_id").in("id", propertyIds)
      : { data: [] as any[] };
    const properties = new Map((propertyRows ?? []).map((p: any) => [p.id, p]));

    const zoneIds = [
      ...new Set((propertyRows ?? []).map((p: any) => p.zone_id).filter((v: any) => v != null)),
    ] as number[];
    const { data: zoneRows } = zoneIds.length
      ? await supabase.from("zones").select("zone_id, zone_name").in("zone_id", zoneIds)
      : { data: [] as any[] };
    const zones = new Map((zoneRows ?? []).map((z: any) => [z.zone_id, z.zone_name]));

    const { data: assignmentRows } = unitIds.length
      ? await supabase
          .from("unit_assignments")
          .select("unit_id, user_id, role, end_date")
          .in("unit_id", unitIds)
          .eq("role", "resident")
          .is("end_date", null)
      : { data: [] as any[] };

    const personIds = [
      ...new Set([
        ...meterList.map((m) => m.landlord_id),
        ...(propertyRows ?? []).map((p: any) => p.landlord_id),
        ...(assignmentRows ?? []).map((a: any) => a.user_id),
        row.created_by,
        row.updated_by,
      ]),
    ].filter((v): v is string => typeof v === "string");

    const { data: userRows } = personIds.length
      ? await supabase.from("users").select("id, name, email").in("id", personIds)
      : { data: [] as any[] };
    const nameById = new Map(
      (userRows ?? []).map((u: any) => [u.id, (u.name as string) || (u.email as string) || null]),
    );

    const residentByUnit = new Map<string, string>();
    for (const a of (assignmentRows ?? []) as any[]) {
      if (!residentByUnit.has(a.unit_id)) residentByUnit.set(a.unit_id, a.user_id);
    }

    const lastReading = new Map<string, { reading: number; at: string }>();
    for (const r of (readingsRes.data ?? []) as any[]) {
      if (!lastReading.has(r.meter_id)) {
        lastReading.set(r.meter_id, { reading: Number(r.reading), at: r.created_at });
      }
    }

    const meters: VendingSoftwareMeterRow[] = meterList.map((m) => {
      const unit = m.unit_id ? units.get(m.unit_id) : null;
      const property = unit?.property_id ? properties.get(unit.property_id) : null;
      const residentId = m.unit_id ? residentByUnit.get(m.unit_id) : undefined;
      const reading = lastReading.get(m.id);
      return {
        id: m.id,
        meter_number: m.meter_number ?? "",
        serial_number: m.serial_number ?? "",
        type: String(m.type ?? "").toLowerCase(),
        status: String(m.status ?? "active").toLowerCase(),
        supplier_name: m.supplier_id ? (suppliers.get(m.supplier_id) ?? null) : null,
        property_name: property?.name ?? null,
        unit_number: unit?.unit_number ?? null,
        zone_name: property?.zone_id != null ? (zones.get(property.zone_id) ?? null) : null,
        landlord_name: m.landlord_id
          ? (nameById.get(m.landlord_id) ?? null)
          : property?.landlord_id
            ? (nameById.get(property.landlord_id) ?? null)
            : null,
        resident_name: residentId ? (nameById.get(residentId) ?? null) : null,
        installation_date: m.installation_date ?? null,
        last_reading: reading ? reading.reading : null,
        last_communication: reading ? reading.at : null,
        assigned_at: m.updated_at ?? m.created_at,
      };
    });

    const tally = (key: (m: VendingSoftwareMeterRow) => string | null) => {
      const map = new Map<string, number>();
      for (const m of meters) {
        const k = key(m) ?? "Unassigned";
        map.set(k, (map.get(k) ?? 0) + 1);
      }
      return [...map.entries()]
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count);
    };

    const usage: VendingSoftwareUsage = {
      total: meters.length,
      activeMeters: meters.filter((m) => m.status === "active").length,
      inactiveMeters: meters.filter((m) => m.status !== "active").length,
      byType: tally((m) => m.type || "unknown"),
      bySupplier: tally((m) => m.supplier_name),
      byZone: tally((m) => m.zone_name),
    };

    const { data: logRows } = await supabase
      .from("vending_software_audit_logs")
      .select("id, action, previous_status, new_status, reason, changes, actor_id, meter_id, created_at")
      .eq("vending_software_id", data.id)
      .order("created_at", { ascending: false })
      .limit(200);

    const actorIds = [
      ...new Set((logRows ?? []).map((l: any) => l.actor_id).filter(Boolean)),
    ] as string[];
    const missingActors = actorIds.filter((id) => !nameById.has(id));
    if (missingActors.length) {
      const { data: actors } = await supabase
        .from("users")
        .select("id, name, email")
        .in("id", missingActors);
      for (const a of (actors ?? []) as any[]) {
        nameById.set(a.id, (a.name as string) || (a.email as string) || null);
      }
    }

    const meterNumberById = new Map(meterList.map((m) => [m.id as string, m.meter_number as string]));

    const history: VendingSoftwareAuditRow[] = (logRows ?? []).map((l: any) => ({
      id: l.id,
      action: l.action,
      previous_status: l.previous_status ?? null,
      new_status: l.new_status ?? null,
      reason: l.reason ?? null,
      changes: (l.changes ?? {}) as Record<string, string | number | boolean | null>,
      actor_name: l.actor_id ? (nameById.get(l.actor_id) ?? null) : null,
      meter_number: l.meter_id
        ? (meterNumberById.get(l.meter_id) ??
          ((l.changes as any)?.meter_number as string | undefined) ??
          null)
        : null,
      created_at: l.created_at,
    }));

    const software: VendingSoftwareDetail = {
      ...mapRow(row, meters.length),
      created_by_name: row.created_by ? (nameById.get(row.created_by) ?? null) : null,
      updated_by_name: row.updated_by ? (nameById.get(row.updated_by) ?? null) : null,
      meters,
      usage,
      history,
    };

    return { software };
  });
