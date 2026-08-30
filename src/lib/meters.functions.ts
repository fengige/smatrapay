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

export type MeterType = "electricity" | "water" | "gas";

export type MeterRow = {
  id: string;
  vendor_id: string;
  supplier_id: string | null;
  supplier_name: string | null;
  landlord_id: string | null;
  landlord_name: string | null;
  agent_id: string | null;
  agent_name: string | null;
  unit_id: string | null;
  unit_label: string | null;
  meter_number: string;
  serial_number: string;
  type: MeterType | string;
  initial_reading: number;
  price_per_unit: number;
  status: string;
  sgc: number | null;
  krn: number | null;
  ti: number | null;
  ea: number | null;
  ken: number | null;
  created_at: string;
  updated_at: string;
};

const METER_COLUMNS =
  "id, vendor_id, supplier_id, landlord_id, agent_id, unit_id, meter_number, serial_number, type, initial_reading, price_per_unit, status, sgc, krn, ti, ea, ken, created_at, updated_at";

const intOrNull = z
  .union([z.number().int(), z.string().trim()])
  .nullable()
  .optional()
  .transform((v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  });

const numOrZero = z
  .union([z.number(), z.string().trim()])
  .nullable()
  .optional()
  .transform((v) => {
    if (v === null || v === undefined || v === "") return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  });

/** Meter / serial identifiers: alphanumeric with dashes, underscores or slashes. */
const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9/_-]*$/;

const identifier = (label: string) =>
  z
    .string()
    .trim()
    .min(4, `${label} must be at least 4 characters`)
    .max(64, `${label} must be at most 64 characters`)
    .regex(IDENTIFIER_RE, `${label} may only contain letters, numbers, - _ /`);

const meterInput = z.object({
  vendor_id: z.string().trim().min(1, "Vendor is required").max(255),
  supplier_id: uuid.nullable().optional(),
  landlord_id: uuid.nullable().optional(),
  agent_id: uuid.nullable().optional(),
  unit_id: uuid.nullable().optional(),
  meter_number: identifier("Meter number"),
  serial_number: identifier("Serial number"),
  type: z.enum(["electricity", "water", "gas"]),
  initial_reading: numOrZero,
  price_per_unit: numOrZero,
  status: z.enum(["active", "inactive"]).optional(),
  sgc: intOrNull,
  krn: intOrNull,
  ti: intOrNull,
  ea: intOrNull,
  ken: intOrNull,
});

const meterUpdateInput = meterInput.extend({ id: uuid });

/**
 * Reject a meter number / serial number that is already used by another meter.
 * `excludeId` skips the row being edited.
 */
async function assertMeterIdentifiersFree(
  supabase: any,
  values: { meter_number: string; serial_number: string },
  excludeId?: string,
) {
  if (values.meter_number.toLowerCase() === values.serial_number.toLowerCase()) {
    throw new Error("Meter number and serial number must be different");
  }

  let query = supabase
    .from("meters")
    .select("id, meter_number, serial_number")
    .or(
      `meter_number.ilike.${values.meter_number},serial_number.ilike.${values.serial_number}`,
    );
  if (excludeId) query = query.neq("id", excludeId);

  const { data: clashes, error } = await query;
  if (error) throw new Error(error.message);

  for (const row of clashes ?? []) {
    if (String(row.meter_number).toLowerCase() === values.meter_number.toLowerCase()) {
      throw new Error(`Meter number ${values.meter_number} is already registered`);
    }
    if (String(row.serial_number).toLowerCase() === values.serial_number.toLowerCase()) {
      throw new Error(`Serial number ${values.serial_number} is already registered`);
    }
  }
}


/** All meters from the meters registry, plus landlord options. */
export const listMeters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabase } = context;

    const { data: rows, error } = await supabase
      .from("meters")
      .select(METER_COLUMNS)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const referencedIds = [
      ...new Set(
        (rows ?? [])
          .flatMap((r: any) => [r.landlord_id, r.agent_id])
          .filter((v: any): v is string => !!v),
      ),
    ];

    let personRows: any[] = [];
    if (referencedIds.length) {
      const { data: l, error: lErr } = await supabase
        .from("users")
        .select("id, name, email")
        .in("id", referencedIds);
      if (lErr) throw new Error(lErr.message);
      personRows = l ?? [];
    }
    const personById = new Map(personRows.map((l) => [l.id, l]));

    // Landlord / agent options for the meter dialog.
    const loadOptions = async (role: "landlord" | "agent" | "vendor", fallback: string) => {
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", role);
      const ids = [...new Set((roleRows ?? []).map((r: any) => r.user_id as string))];
      if (!ids.length) return [] as { id: string; name: string }[];
      const { data: opts } = await supabase.from("users").select("id, name, email").in("id", ids);
      const list = (opts ?? []).map((u: any) => ({
        id: u.id as string,
        name: (u.name as string) || (u.email as string) || fallback,
      }));
      list.sort((a, b) => a.name.localeCompare(b.name));
      return list;
    };

    const [landlordOptions, agentOptions, vendorOptions] = await Promise.all([
      loadOptions("landlord", "Unnamed landlord"),
      loadOptions("agent", "Unnamed agent"),
      loadOptions("vendor", "Unnamed vendor"),
    ]);

    // Active supplier options for the meter dialog.
    const { data: supplierRows } = await supabase
      .from("meter_suppliers")
      .select("id, company_name")
      .eq("status", "Active")
      .order("company_name", { ascending: true });
    const supplierOptions = (supplierRows ?? []).map((s: any) => ({
      id: s.id as string,
      name: (s.company_name as string) ?? "",
    }));
    const supplierById = new Map(supplierOptions.map((s) => [s.id, s]));

    // Unit options (with property names) for optionally linking a meter to a unit.
    const { data: unitRows } = await supabase
      .from("units")
      .select("id, unit_number, property_id, properties(name)")
      .order("unit_number", { ascending: true });
    const unitOptions = (unitRows ?? []).map((u: any) => ({
      id: u.id as string,
      unit_number: (u.unit_number as string) ?? "",
      property_id: (u.property_id as string) ?? null,
      property_name: (u.properties?.name as string) ?? null,
      label: `${u.properties?.name ? `${u.properties.name} · ` : ""}Unit ${u.unit_number}`,
    }));
    const unitById = new Map(unitOptions.map((u) => [u.id, u]));

    const displayName = (id: string | null) => {
      if (!id) return null;
      const p = personById.get(id);
      return ((p?.name as string) || (p?.email as string) || null) as string | null;
    };

    const meters: MeterRow[] = (rows ?? []).map((r: any) => ({
      id: r.id,
      vendor_id: r.vendor_id ?? "",
      supplier_id: r.supplier_id ?? null,
      supplier_name: r.supplier_id ? (supplierById.get(r.supplier_id)?.name ?? null) : null,
      landlord_id: r.landlord_id ?? null,
      landlord_name: displayName(r.landlord_id ?? null),
      agent_id: r.agent_id ?? null,
      agent_name: displayName(r.agent_id ?? null),
      unit_id: r.unit_id ?? null,
      unit_label: r.unit_id ? (unitById.get(r.unit_id)?.label ?? null) : null,
      meter_number: r.meter_number ?? "",
      serial_number: r.serial_number ?? "",
      type: (r.type ?? "").toLowerCase(),
      initial_reading: Number(r.initial_reading ?? 0),
      price_per_unit: Number(r.price_per_unit ?? 0),
      status: (r.status ?? "active").toLowerCase(),
      sgc: r.sgc ?? null,
      krn: r.krn ?? null,
      ti: r.ti ?? null,
      ea: r.ea ?? null,
      ken: r.ken ?? null,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));

    return {
      meters,
      landlords: landlordOptions,
      agents: agentOptions,
      vendors: vendorOptions,
      units: unitOptions,
      suppliers: supplierOptions,
    };
  });


export const addMeter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => meterInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabase } = context;

    await assertMeterIdentifiersFree(supabase, data);

    const { data: inserted, error } = await supabase
      .from("meters")
      .insert({
        vendor_id: data.vendor_id,
        supplier_id: data.supplier_id ?? null,
        landlord_id: data.landlord_id ?? null,
        agent_id: data.agent_id ?? null,
        unit_id: data.unit_id ?? null,
        meter_number: data.meter_number,
        serial_number: data.serial_number,
        type: data.type,
        initial_reading: data.initial_reading,
        price_per_unit: data.price_per_unit,
        status: data.status ?? "active",
        sgc: data.sgc,
        krn: data.krn,
        ti: data.ti,
        ea: data.ea,
        ken: data.ken,
      } as never)
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("Meter number or serial number already exists");
      throw new Error(error.message);
    }

    return { ok: true, id: inserted?.id as string };
  });

export const updateMeter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => meterUpdateInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabase } = context;

    const { data: current, error: curErr } = await supabase
      .from("meters")
      .select("id")
      .eq("id", data.id)
      .maybeSingle();
    if (curErr) throw new Error(curErr.message);
    if (!current) throw new Error("Meter not found");

    await assertMeterIdentifiersFree(supabase, data, data.id);

    const { error } = await supabase
      .from("meters")
      .update({
        vendor_id: data.vendor_id,
        supplier_id: data.supplier_id ?? null,
        landlord_id: data.landlord_id ?? null,
        agent_id: data.agent_id ?? null,
        unit_id: data.unit_id ?? null,
        meter_number: data.meter_number,
        serial_number: data.serial_number,
        type: data.type,
        initial_reading: data.initial_reading,
        price_per_unit: data.price_per_unit,
        status: data.status ?? "active",
        sgc: data.sgc,
        krn: data.krn,
        ti: data.ti,
        ea: data.ea,
        ken: data.ken,
      } as never)
      .eq("id", data.id);
    if (error) {
      if (error.code === "23505") throw new Error("Meter number or serial number already exists");
      throw new Error(error.message);
    }

    return { ok: true };
  });


const bulkMeterInput = z.object({
  action: z.enum(["delete", "deactivate", "activate"]),
  ids: z.array(uuid).min(1).max(500),
});

/** Delete / deactivate / activate many meters at once. */
export const bulkMeterAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => bulkMeterInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabase } = context;

    if (data.action === "delete") {
      const { error } = await supabase.from("meters").delete().in("id", data.ids);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from("meters")
        .update({ status: data.action === "activate" ? "active" : "inactive" } as never)
        .in("id", data.ids);
      if (error) throw new Error(error.message);
    }

    return { ok: true, meters: data.ids.length };
  });

export type MeterAuditEntry = {
  id: string;
  action: string;
  created_at: string;
  actor_name: string | null;
  changes: Record<string, { old: string | null; new: string | null }>;
};

/** Change history for a single meter (reading, price, type, status). */
export const listMeterAuditLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ meter_id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("meter_audit_logs")
      .select("id, action, changes, created_at, actor_id")
      .eq("meter_id", data.meter_id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);

    const actorIds = [
      ...new Set((rows ?? []).map((r: any) => r.actor_id).filter((v: any): v is string => !!v)),
    ];
    let actors: any[] = [];
    if (actorIds.length) {
      const { data: a } = await supabase.from("users").select("id, name, email").in("id", actorIds);
      actors = a ?? [];
    }
    const actorById = new Map(actors.map((a) => [a.id, a]));

    // Resolve reference ids (unit / landlord / agent / supplier) to readable labels.
    const refFields = new Set(["unit_id", "landlord_id", "agent_id", "supplier_id"]);
    const refIds: Record<string, Set<string>> = {
      unit_id: new Set(),
      landlord_id: new Set(),
      agent_id: new Set(),
      supplier_id: new Set(),
    };
    for (const r of rows ?? []) {
      for (const [field, diff] of Object.entries((r.changes ?? {}) as Record<string, any>)) {
        if (!refFields.has(field)) continue;
        for (const v of [diff?.old, diff?.new]) if (v) refIds[field]!.add(String(v));
      }
    }

    const labelById = new Map<string, string>();
    const unitIds = [...refIds["unit_id"]!];
    if (unitIds.length) {
      const { data: us } = await supabase
        .from("units")
        .select("id, unit_number, properties(name)")
        .in("id", unitIds);
      for (const u of (us ?? []) as any[]) {
        const property = (u.properties as any)?.name as string | undefined;
        labelById.set(u.id, property ? `${property} · Unit ${u.unit_number}` : `Unit ${u.unit_number}`);
      }
    }
    const personIds = [...refIds["landlord_id"]!, ...refIds["agent_id"]!];
    if (personIds.length) {
      const { data: ps } = await supabase.from("users").select("id, name, email").in("id", personIds);
      for (const u of (ps ?? []) as any[]) labelById.set(u.id, u.name ?? u.email ?? u.id);
    }
    const supplierIds = [...refIds["supplier_id"]!];
    if (supplierIds.length) {
      const { data: ss } = await supabase
        .from("meter_suppliers")
        .select("id, company_name")
        .in("id", supplierIds);
      for (const sup of (ss ?? []) as any[]) labelById.set(sup.id, sup.company_name);
    }

    const display = (field: string, value: unknown) => {
      if (value === null || value === undefined || value === "") return null;
      const raw = String(value);
      return refFields.has(field) ? (labelById.get(raw) ?? raw) : raw;
    };

    return {
      logs: (rows ?? []).map((r: any) => ({
        id: r.id as string,
        action: (r.action as string) ?? "update",
        created_at: r.created_at as string,
        actor_name: r.actor_id
          ? ((actorById.get(r.actor_id)?.name as string) ??
            (actorById.get(r.actor_id)?.email as string) ??
            null)
          : null,
        changes: Object.fromEntries(
          Object.entries((r.changes ?? {}) as Record<string, any>).map(([k, v]) => [
            k,
            { old: display(k, v?.old), new: display(k, v?.new) },
          ]),
        ),
      })) satisfies MeterAuditEntry[],
    };
  });

/** Meters linked to a specific unit. */
export const listUnitMeters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ unit_id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("meters")
      .select(METER_COLUMNS)
      .eq("unit_id", data.unit_id)
      .order("type", { ascending: true });
    if (error) throw new Error(error.message);
    return {
      meters: (rows ?? []).map((r: any) => ({
        id: r.id as string,
        vendor_id: (r.vendor_id as string) ?? "",
        meter_number: (r.meter_number as string) ?? "",
        serial_number: (r.serial_number as string) ?? "",
        type: ((r.type as string) ?? "").toLowerCase(),
        initial_reading: Number(r.initial_reading ?? 0),
        price_per_unit: Number(r.price_per_unit ?? 0),
        status: ((r.status as string) ?? "active").toLowerCase(),
      })),
    };
  });

/* ------------------------------------------------------------------ *
 * CSV import
 * ------------------------------------------------------------------ */

export const METER_CSV_HEADERS = [
  "meter_number",
  "serial_number",
  "type",
  "vendor_id",
  "landlord_email",
  "agent_email",
  "initial_reading",
  "price_per_unit",
  "status",
  "sgc",
  "krn",
  "ti",
  "ea",
  "ken",
] as const;

export type MeterDuplicateMode = "reject" | "skip" | "update";

export type MeterImportResult = {
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: { row: number; meter_number: string; message: string }[];
  duplicates: { row: number; meter_number: string; serial_number: string; reason: string }[];
};

const importRow = z.object({
  row: z.number().int().min(1),
  meter_number: z.string().trim().default(""),
  serial_number: z.string().trim().default(""),
  type: z.string().trim().default(""),
  vendor_id: z.string().trim().default(""),
  landlord_email: z.string().trim().default(""),
  agent_email: z.string().trim().default(""),
  initial_reading: z.string().trim().default(""),
  price_per_unit: z.string().trim().default(""),
  status: z.string().trim().default(""),
  sgc: z.string().trim().default(""),
  krn: z.string().trim().default(""),
  ti: z.string().trim().default(""),
  ea: z.string().trim().default(""),
  ken: z.string().trim().default(""),
});

const importInput = z.object({
  rows: z.array(importRow).min(1).max(2000),
  duplicate_mode: z.enum(["reject", "skip", "update"]).default("reject"),
});


/** Import meters from parsed CSV rows, validating and enforcing uniqueness server-side. */
export const importMeters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => importInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabase } = context;

    const { data: existing, error: exErr } = await supabase
      .from("meters")
      .select("id, meter_number, serial_number");
    if (exErr) throw new Error(exErr.message);

    const mode = data.duplicate_mode ?? "reject";

    // Existing registry lookups (case-insensitive).
    const meterByNumber = new Map<string, { id: string; serial: string }>();
    const meterBySerial = new Map<string, { id: string; number: string }>();
    for (const r of (existing ?? []) as any[]) {
      meterByNumber.set(String(r.meter_number).toLowerCase(), {
        id: r.id,
        serial: String(r.serial_number ?? ""),
      });
      meterBySerial.set(String(r.serial_number).toLowerCase(), {
        id: r.id,
        number: String(r.meter_number ?? ""),
      });
    }

    // Resolve landlord / agent emails to user ids.
    const emails = [
      ...new Set(
        data.rows
          .flatMap((r) => [r.landlord_email, r.agent_email])
          .map((e) => e.toLowerCase())
          .filter(Boolean),
      ),
    ];
    let userByEmail = new Map<string, string>();
    if (emails.length) {
      const { data: users } = await supabase.from("users").select("id, email").in("email", emails);
      userByEmail = new Map(
        (users ?? []).map((u: any) => [String(u.email ?? "").toLowerCase(), u.id as string]),
      );
    }

    const errors: MeterImportResult["errors"] = [];
    const duplicates: MeterImportResult["duplicates"] = [];
    const toInsert: any[] = [];
    const toUpdate: { id: string; values: any }[] = [];
    let skipped = 0;

    // Identifiers used earlier in this same file.
    const seenMeters = new Set<string>();
    const seenSerials = new Set<string>();

    for (const r of data.rows) {
      try {
        const parsed = meterInput.parse({
          vendor_id: r.vendor_id,
          meter_number: r.meter_number,
          serial_number: r.serial_number,
          type: r.type.toLowerCase(),
          initial_reading: r.initial_reading,
          price_per_unit: r.price_per_unit,
          status: r.status ? r.status.toLowerCase() : undefined,
          sgc: r.sgc,
          krn: r.krn,
          ti: r.ti,
          ea: r.ea,
          ken: r.ken,
        });

        const mKey = parsed.meter_number.toLowerCase();
        const sKey = parsed.serial_number.toLowerCase();
        if (mKey === sKey) throw new Error("Meter number and serial number must be different");
        if (seenMeters.has(mKey))
          throw new Error(`Meter number ${parsed.meter_number} appears twice in this file`);
        if (seenSerials.has(sKey))
          throw new Error(`Serial number ${parsed.serial_number} appears twice in this file`);

        const byNumber = meterByNumber.get(mKey);
        const bySerial = meterBySerial.get(sKey);

        if (byNumber || bySerial) {
          const reason = byNumber
            ? `Meter number ${parsed.meter_number} is already registered`
            : `Serial number ${parsed.serial_number} is already registered`;

          if (mode === "reject") throw new Error(reason);

          if (mode === "skip") {
            duplicates.push({
              row: r.row,
              meter_number: parsed.meter_number,
              serial_number: parsed.serial_number,
              reason,
            });
            skipped += 1;
            seenMeters.add(mKey);
            seenSerials.add(sKey);
            continue;
          }

          // update mode — both identifiers must point at the same meter.
          if (byNumber && bySerial && byNumber.id !== bySerial.id) {
            throw new Error(
              `Meter number ${parsed.meter_number} and serial number ${parsed.serial_number} belong to different meters`,
            );
          }
        }

        let landlord_id: string | null = null;
        if (r.landlord_email) {
          landlord_id = userByEmail.get(r.landlord_email.toLowerCase()) ?? null;
          if (!landlord_id) throw new Error(`No user found for landlord ${r.landlord_email}`);
        }
        let agent_id: string | null = null;
        if (r.agent_email) {
          agent_id = userByEmail.get(r.agent_email.toLowerCase()) ?? null;
          if (!agent_id) throw new Error(`No user found for agent ${r.agent_email}`);
        }

        seenMeters.add(mKey);
        seenSerials.add(sKey);

        const values = {
          vendor_id: parsed.vendor_id,
          landlord_id,
          agent_id,
          meter_number: parsed.meter_number,
          serial_number: parsed.serial_number,
          type: parsed.type,
          initial_reading: parsed.initial_reading,
          price_per_unit: parsed.price_per_unit,
          status: parsed.status ?? "active",
          sgc: parsed.sgc,
          krn: parsed.krn,
          ti: parsed.ti,
          ea: parsed.ea,
          ken: parsed.ken,
        };

        const existingId = byNumber?.id ?? bySerial?.id;
        if (mode === "update" && existingId) {
          duplicates.push({
            row: r.row,
            meter_number: parsed.meter_number,
            serial_number: parsed.serial_number,
            reason: "Existing meter will be updated",
          });
          toUpdate.push({ id: existingId, values });
          // Keep the lookup fresh so later rows see the new identifiers.
          meterByNumber.set(mKey, { id: existingId, serial: parsed.serial_number });
          meterBySerial.set(sKey, { id: existingId, number: parsed.meter_number });
        } else {
          toInsert.push({ ...values, unit_id: null });
          meterByNumber.set(mKey, { id: "pending", serial: parsed.serial_number });
          meterBySerial.set(sKey, { id: "pending", number: parsed.meter_number });
        }
      } catch (e: any) {
        const message =
          e?.issues?.[0]?.message ?? e?.message ?? "Row could not be validated";
        errors.push({ row: r.row, meter_number: r.meter_number, message });
      }
    }

    let imported = 0;
    if (toInsert.length) {
      const { error, count } = await supabase
        .from("meters")
        .insert(toInsert as never, { count: "exact" });
      if (error) throw new Error(error.message);
      imported = count ?? toInsert.length;
    }

    let updated = 0;
    for (const u of toUpdate) {
      const { error } = await supabase.from("meters").update(u.values as never).eq("id", u.id);
      if (error) {
        errors.push({
          row: 0,
          meter_number: u.values.meter_number,
          message: error.message,
        });
      } else {
        updated += 1;
      }
    }

    return {
      imported,
      updated,
      skipped,
      failed: errors.length,
      errors,
      duplicates,
    } satisfies MeterImportResult;
  });


/* ------------------------------------------------------------------ *
 * Bulk add meters
 * ------------------------------------------------------------------ */

const bulkAddRow = z.object({
  meter_number: identifier("Meter number"),
  serial_number: z.string().trim().default(""),
  sgc: intOrNull,
  krn: intOrNull,
  ti: intOrNull,
  ea: intOrNull,
  ken: intOrNull,
});

const bulkAddInput = z.object({
  supplier_id: uuid.nullable().optional(),
  owner_type: z.enum(["vendor", "landlord", "agent"]),
  owner_id: uuid,
  type: z.enum(["electricity", "water", "gas"]),
  price_per_unit: numOrZero,
  initial_reading: numOrZero,
  rows: z.array(bulkAddRow).min(1).max(500),
  /** reject (default) fails the batch on duplicates, skip ignores them, update overwrites. */
  duplicate_mode: z.enum(["reject", "skip", "update"]).default("reject"),
  /** Must be true to run the destructive "update" mode. */
  confirm_update: z.boolean().optional().default(false),
});

export type BulkAddRowResult = {
  row: number;
  meter_number: string;
  serial_number: string;
  status: "created" | "updated" | "skipped" | "failed";
  message: string;
};

export type BulkAddResult = {
  ok: boolean;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  results: BulkAddRowResult[];
};

/**
 * Create many meters at once for one supplier + one owner (vendor / landlord / agent).
 * The whole batch runs inside a single database transaction (public.bulk_add_meters):
 * any failed row or unexpected error rolls back everything, and per-row results are
 * computed from the actual database outcome (created / updated / skipped).
 */
export const bulkAddMeters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => bulkAddInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabase } = context;

    if (data.duplicate_mode === "update" && !data.confirm_update) {
      throw new Error("Updating existing meters must be explicitly confirmed");
    }

    const { data: result, error } = await (supabase.rpc as any)("bulk_add_meters", {
      p_payload: {
        supplier_id: data.supplier_id ?? null,
        owner_type: data.owner_type,
        owner_id: data.owner_id,
        type: data.type,
        price_per_unit: data.price_per_unit,
        initial_reading: data.initial_reading,
        duplicate_mode: data.duplicate_mode,
        rows: data.rows,
      },
    });
    if (error) throw new Error(error.message);
    return result as BulkAddResult;
  });


/* ------------------------------------------------------------------ *
 * Bulk add meters — form options (suppliers + vendor/landlord/agent users)
 * ------------------------------------------------------------------ */

export type BulkMeterOptions = {
  suppliers: { id: string; name: string; utility_type: string }[];
  vendors: { id: string; name: string }[];
  landlords: { id: string; name: string }[];
  agents: { id: string; name: string }[];
};

/** Lightweight option lists for the dedicated Add Meters page. */
export const listBulkMeterOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabase } = context;

    const loadRole = async (role: "vendor" | "landlord" | "agent", fallback: string) => {
      const { data: roleRows, error } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", role);
      if (error) throw new Error(error.message);
      const ids = [...new Set((roleRows ?? []).map((r: any) => r.user_id as string))];
      if (!ids.length) return [] as { id: string; name: string }[];
      const { data: users } = await supabase.from("users").select("id, name, email").in("id", ids);
      const list = (users ?? []).map((u: any) => ({
        id: u.id as string,
        name: (u.name as string) || (u.email as string) || fallback,
      }));
      list.sort((a, b) => a.name.localeCompare(b.name));
      return list;
    };

    const [vendors, landlords, agents] = await Promise.all([
      loadRole("vendor", "Unnamed vendor"),
      loadRole("landlord", "Unnamed landlord"),
      loadRole("agent", "Unnamed agent"),
    ]);

    const { data: supplierRows, error: sErr } = await supabase
      .from("meter_suppliers")
      .select("id, company_name, utility_type")
      .eq("status", "Active")
      .order("company_name", { ascending: true });
    if (sErr) throw new Error(sErr.message);

    return {
      suppliers: (supplierRows ?? []).map((s: any) => ({
        id: s.id as string,
        name: (s.company_name as string) ?? "",
        utility_type: (s.utility_type as string) ?? "",
      })),
      vendors,
      landlords,
      agents,
    } satisfies BulkMeterOptions;
  });

/* ------------------------------------------------------------------ *
 * View / activate / assign
 * ------------------------------------------------------------------ */

export type MeterDetail = MeterRow & {
  supplier: {
    id: string;
    company_name: string;
    utility_type: string;
    status: string;
    contact_name: string | null;
    email: string | null;
    phone_number: string | null;
  } | null;
  unit: {
    id: string;
    unit_number: string;
    property_id: string | null;
    property_name: string | null;
  } | null;
  landlord: { id: string; name: string | null; email: string | null } | null;
  agent: { id: string; name: string | null; email: string | null } | null;
};

/** Full details for a single meter, including supplier, unit and owner records. */
export const getMeter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: row, error } = await supabase
      .from("meters")
      .select(METER_COLUMNS)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Meter not found");
    const m = row as any;

    let supplier: MeterDetail["supplier"] = null;
    if (m.supplier_id) {
      const { data: s } = await supabase
        .from("meter_suppliers")
        .select("id, company_name, utility_type, status, contact_name, email, phone_number")
        .eq("id", m.supplier_id)
        .maybeSingle();
      if (s) supplier = s as unknown as MeterDetail["supplier"];
    }

    let unit: MeterDetail["unit"] = null;
    if (m.unit_id) {
      const { data: u } = await supabase
        .from("units")
        .select("id, unit_number, property_id, properties(name)")
        .eq("id", m.unit_id)
        .maybeSingle();
      if (u) {
        const uu = u as any;
        unit = {
          id: uu.id,
          unit_number: uu.unit_number ?? "",
          property_id: uu.property_id ?? null,
          property_name: uu.properties?.name ?? null,
        };
      }
    }

    const personIds = [m.landlord_id, m.agent_id].filter((v: any): v is string => !!v);
    let people: any[] = [];
    if (personIds.length) {
      const { data: p } = await supabase
        .from("users")
        .select("id, name, email")
        .in("id", [...new Set(personIds)]);
      people = p ?? [];
    }
    const personById = new Map(people.map((p) => [p.id, p]));
    const person = (id: string | null) => {
      if (!id) return null;
      const p = personById.get(id);
      return p ? { id, name: p.name ?? null, email: p.email ?? null } : { id, name: null, email: null };
    };

    const meter: MeterDetail = {
      id: m.id,
      vendor_id: m.vendor_id ?? "",
      supplier_id: m.supplier_id ?? null,
      supplier_name: supplier ? supplier.company_name : null,
      landlord_id: m.landlord_id ?? null,
      landlord_name: person(m.landlord_id ?? null)?.name ?? null,
      agent_id: m.agent_id ?? null,
      agent_name: person(m.agent_id ?? null)?.name ?? null,
      unit_id: m.unit_id ?? null,
      unit_label: unit
        ? `${unit.property_name ? `${unit.property_name} · ` : ""}Unit ${unit.unit_number}`
        : null,
      meter_number: m.meter_number ?? "",
      serial_number: m.serial_number ?? "",
      type: (m.type ?? "").toLowerCase(),
      initial_reading: Number(m.initial_reading ?? 0),
      price_per_unit: Number(m.price_per_unit ?? 0),
      status: (m.status ?? "active").toLowerCase(),
      sgc: m.sgc ?? null,
      krn: m.krn ?? null,
      ti: m.ti ?? null,
      ea: m.ea ?? null,
      ken: m.ken ?? null,
      created_at: m.created_at,
      updated_at: m.updated_at,
      supplier,
      unit,
      landlord: person(m.landlord_id ?? null),
      agent: person(m.agent_id ?? null),
    };

    return { meter };
  });

/** Activate or deactivate a single meter. */
export const setMeterStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: uuid, status: z.enum(["active", "inactive"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabase } = context;

    const { data: current, error: curErr } = await supabase
      .from("meters")
      .select("id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (curErr) throw new Error(curErr.message);
    if (!current) throw new Error("Meter not found");

    const { error } = await supabase
      .from("meters")
      .update({ status: data.status } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    return { ok: true, status: data.status };
  });

/** Assign (or clear) a meter's unit, landlord and agent. */
export const assignMeter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid,
        unit_id: uuid.nullable().optional(),
        landlord_id: uuid.nullable().optional(),
        agent_id: uuid.nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabase } = context;

    const { data: current, error: curErr } = await supabase
      .from("meters")
      .select("id, type")
      .eq("id", data.id)
      .maybeSingle();
    if (curErr) throw new Error(curErr.message);
    if (!current) throw new Error("Meter not found");

    if (data.unit_id) {
      const { data: unit, error: uErr } = await supabase
        .from("units")
        .select("id")
        .eq("id", data.unit_id)
        .maybeSingle();
      if (uErr) throw new Error(uErr.message);
      if (!unit) throw new Error("Selected unit no longer exists");

      // Prevent two meters of the same utility type on one unit.
      const { data: clash, error: cErr } = await supabase
        .from("meters")
        .select("id, meter_number")
        .eq("unit_id", data.unit_id)
        .eq("type", (current as any).type)
        .neq("id", data.id);
      if (cErr) throw new Error(cErr.message);
      if ((clash ?? []).length) {
        throw new Error(
          `Meter ${(clash as any)[0].meter_number} is already assigned to this unit for the same utility`,
        );
      }
    }

    const { error } = await supabase
      .from("meters")
      .update({
        unit_id: data.unit_id ?? null,
        landlord_id: data.landlord_id ?? null,
        agent_id: data.agent_id ?? null,
      } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    return { ok: true };
  });
