import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertVendor, logVendorAction } from "@/lib/vendor.server";
import { residentUsername, trustedRecoveryUrl } from "./resident-password";
import { getRequestHeader } from "@tanstack/react-start/server";

/**
 * Vendor-scoped resident management.
 *
 * Every read goes through the caller's RLS-bound client, so a vendor can only
 * ever see residents, units, properties, meters and payments inside their own
 * scope. Writes need the service role (auth admin + profile tables are
 * admin-only), so each one re-verifies the target is inside the caller's scope
 * through the RLS client *before* the privileged call is made.
 */

type Client = { from: (t: string) => any; rpc: (n: string, a?: any) => any };

export type VendorResidentRow = {
  id: string;
  name: string | null;
  email: string | null;
  username: string | null;
  phone: string | null;
  id_number: string | null;
  address: string | null;
  status: string;
  profile_image: string | null;
  created_at: string;
  assignment_id: string | null;
  unit_id: string | null;
  unit_number: string | null;
  unit_type: string | null;
  unit_status: string | null;
  property_id: string | null;
  property_name: string | null;
  property_address: string | null;
  zone_id: number | null;
  zone_name: string | null;
  assigned_at: string | null;
  meter_numbers: string[];
};

const uuid = z.string().uuid();

async function scopeUnits(supabase: Client) {
  const { data: units, error } = await supabase
    .from("units")
    .select("id, unit_number, unit_type, status, building, floor, property_id");
  if (error) throw new Error(error.message);
  const unitRows = (units ?? []) as any[];
  const propertyIds = [...new Set(unitRows.map((u) => u.property_id).filter(Boolean))];

  const { data: props } = propertyIds.length
    ? await supabase
        .from("properties")
        .select("id, name, address_line1, address_line2, city, zone_id, landlord_id, owner_type")
        .in("id", propertyIds)
    : { data: [] as any[] };
  const propertyRows = (props ?? []) as any[];
  const zoneIds = [...new Set(propertyRows.map((p) => p.zone_id).filter((z) => z != null))];

  const { data: zones } = zoneIds.length
    ? await supabase.from("zones").select("zone_id, zone_name").in("zone_id", zoneIds)
    : { data: [] as any[] };

  const zoneMap = new Map<number, any>(
    ((zones ?? []) as any[]).map((z): [number, any] => [z.zone_id, z]),
  );
  const propertyMap = new Map<string, any>(
    propertyRows.map((p): [string, any] => [
      p.id,
      {
        ...p,
        zone_name: p.zone_id != null ? (zoneMap.get(p.zone_id)?.zone_name ?? null) : null,
        address: [p.address_line1, p.address_line2, p.city].filter(Boolean).join(", ") || null,
      },
    ]),
  );
  const unitMap = new Map<string, any>(
    unitRows.map((u): [string, any] => [u.id, { ...u, property: propertyMap.get(u.property_id) ?? null }]),
  );
  return { unitMap, propertyMap, zoneMap };
}

/** Throws unless the resident is visible to the caller's RLS scope. */
async function assertResidentInScope(supabase: Client, residentId: string) {
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .eq("id", residentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Access denied");
  return residentId;
}

async function assertUnitInScope(supabase: Client, unitId: string) {
  const { data, error } = await supabase.from("units").select("id").eq("id", unitId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Access denied");
  return unitId;
}

async function recordResidentEvent(
  admin: Client,
  residentId: string,
  actorId: string,
  action: string,
  changes: Record<string, unknown>,
) {
  await admin.from("user_audit_logs").insert({
    user_id: residentId,
    actor_id: actorId,
    action,
    changes,
  });
}

export const listVendorResidents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const vendorId = await assertVendor(context as never);

    const { data: assignments, error } = await supabase
      .from("unit_assignments")
      .select("id, unit_id, user_id, start_date, end_date, role")
      .eq("role", "resident")
      .order("start_date", { ascending: false });
    if (error) throw new Error(error.message);

    const active = ((assignments ?? []) as any[]).filter((a) => !a.end_date);
    const residentIds = [...new Set(active.map((a) => a.user_id))];

    const { data: users } = residentIds.length
      ? await supabase
          .from("users")
          .select("id, name, email, username, phone, status, profile_image, created_at, id_number, address")
          .in("id", residentIds)
      : { data: [] as any[] };

    const { unitMap } = await scopeUnits(supabase as never);

    const { data: meters } = await supabase.from("meters").select("id, meter_number, unit_id");
    const metersByUnit = new Map<string, string[]>();
    for (const m of (meters ?? []) as any[]) {
      if (!m.unit_id) continue;
      metersByUnit.set(m.unit_id, [...(metersByUnit.get(m.unit_id) ?? []), m.meter_number]);
    }

    const userMap = new Map(((users ?? []) as any[]).map((u) => [u.id, u]));
    const rows: VendorResidentRow[] = [];
    for (const a of active) {
      const user = userMap.get(a.user_id);
      if (!user) continue;
      const unit = unitMap.get(a.unit_id);
      const property = unit?.property ?? null;
      rows.push({
        id: user.id,
        name: user.name ?? null,
        email: user.email ?? null,
        username: user.username ?? null,
        phone: user.phone ?? null,
        id_number: user.id_number ?? null,
        address: user.address ?? null,
        status: user.status ?? "active",
        profile_image: user.profile_image ?? null,
        created_at: user.created_at,
        assignment_id: a.id,
        unit_id: a.unit_id,
        unit_number: unit?.unit_number ?? null,
        unit_type: unit?.unit_type ?? null,
        unit_status: unit?.status ?? null,
        property_id: property?.id ?? null,
        property_name: property?.name ?? null,
        property_address: property?.address ?? null,
        zone_id: property?.zone_id ?? null,
        zone_name: property?.zone_name ?? null,
        assigned_at: a.start_date ?? null,
        meter_numbers: metersByUnit.get(a.unit_id) ?? [],
      });
    }

    // Residents in scope with no active unit assignment (e.g. just created).
    const seen = new Set(rows.map((r) => r.id));
    const { data: scopeUsers } = await supabase
      .from("users")
      .select("id, name, email, username, phone, status, profile_image, created_at, id_number, address");
    for (const u of ((scopeUsers ?? []) as any[]).filter((u) => !seen.has(u.id))) {
      rows.push({
        id: u.id,
        name: u.name ?? null,
        email: u.email ?? null,
        username: u.username ?? null,
        phone: u.phone ?? null,
        id_number: u.id_number ?? null,
        address: u.address ?? null,
        status: u.status ?? "active",
        profile_image: u.profile_image ?? null,
        created_at: u.created_at,
        assignment_id: null,
        unit_id: null,
        unit_number: null,
        unit_type: null,
        unit_status: null,
        property_id: null,
        property_name: null,
        property_address: null,
        zone_id: null,
        zone_name: null,
        assigned_at: null,
        meter_numbers: [],
      });
    }

    // Only users that actually hold the resident role belong in this list.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const candidateIds = [...new Set(rows.map((r) => r.id))];
    const { data: roleRows } = candidateIds.length
      ? await supabaseAdmin
          .from("user_roles")
          .select("user_id")
          .eq("role", "resident")
          .in("user_id", candidateIds)
      : { data: [] as any[] };
    const residentRoleIds = new Set(((roleRows ?? []) as any[]).map((r) => r.user_id));
    const filtered = rows.filter((r) => residentRoleIds.has(r.id));

    filtered.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    return { vendorId, residents: filtered };
  });

export const listVendorAssignableUnits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    await assertVendor(context as never);

    const { unitMap } = await scopeUnits(supabase as never);
    const { data: assignments } = await supabase
      .from("unit_assignments")
      .select("unit_id, user_id, end_date, role")
      .eq("role", "resident");
    const occupied = new Map<string, string>();
    for (const a of ((assignments ?? []) as any[]).filter((a) => !a.end_date)) {
      occupied.set(a.unit_id, a.user_id);
    }
    const occupantIds = [...new Set([...occupied.values()])];
    const { data: occupants } = occupantIds.length
      ? await supabase.from("users").select("id, name, email").in("id", occupantIds)
      : { data: [] as any[] };
    const occupantMap = new Map(((occupants ?? []) as any[]).map((u) => [u.id, u]));

    const units = [...unitMap.values()].map((u: any) => {
      const occupantId = occupied.get(u.id) ?? null;
      const occupant = occupantId ? occupantMap.get(occupantId) : null;
      return {
        id: u.id as string,
        unit_number: u.unit_number as string,
        unit_type: (u.unit_type ?? null) as string | null,
        status: (u.status ?? "vacant") as string,
        property_id: (u.property?.id ?? null) as string | null,
        property_name: (u.property?.name ?? null) as string | null,
        zone_id: (u.property?.zone_id ?? null) as number | null,
        zone_name: (u.property?.zone_name ?? null) as string | null,
        occupant_id: occupantId,
        occupant_name: (occupant?.name ?? occupant?.email ?? null) as string | null,
      };
    });
    units.sort(
      (a, b) =>
        (a.property_name ?? "").localeCompare(b.property_name ?? "") ||
        a.unit_number.localeCompare(b.unit_number),
    );
    return { units };
  });

export const getVendorResident = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const vendorId = await assertVendor(context as never);

    const { data: resident, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!resident) throw new Error("Access denied");

    const { data: assignments } = await supabase
      .from("unit_assignments")
      .select("id, unit_id, start_date, end_date, notes, role")
      .eq("user_id", data.id)
      .eq("role", "resident")
      .order("start_date", { ascending: false });

    const { unitMap } = await scopeUnits(supabase as never);
    const assignmentRows = ((assignments ?? []) as any[]).map((a) => {
      const unit = unitMap.get(a.unit_id);
      const property = unit?.property ?? null;
      return {
        id: a.id as string,
        unit_id: a.unit_id as string,
        unit_number: (unit?.unit_number ?? null) as string | null,
        unit_type: (unit?.unit_type ?? null) as string | null,
        unit_status: (unit?.status ?? null) as string | null,
        property_id: (property?.id ?? null) as string | null,
        property_name: (property?.name ?? null) as string | null,
        property_address: (property?.address ?? null) as string | null,
        zone_id: (property?.zone_id ?? null) as number | null,
        zone_name: (property?.zone_name ?? null) as string | null,
        landlord_id: (property?.landlord_id ?? null) as string | null,
        owner_type: (property?.owner_type ?? null) as string | null,
        start_date: (a.start_date ?? null) as string | null,
        end_date: (a.end_date ?? null) as string | null,
        notes: (a.notes ?? null) as string | null,
        current: !a.end_date,
      };
    });

    const unitIds = assignmentRows.map((a) => a.unit_id);
    const { data: meters } = unitIds.length
      ? await supabase
          .from("meters")
          .select(
            "id, meter_number, serial_number, type, status, installation_status, installation_date, unit_id, supplier_id, price_per_unit, initial_reading",
          )
          .in("unit_id", unitIds)
      : { data: [] as any[] };
    const meterRows = (meters ?? []) as any[];

    const supplierIds = [...new Set(meterRows.map((m) => m.supplier_id).filter(Boolean))];
    const { data: suppliers } = supplierIds.length
      ? await supabase.from("meter_suppliers").select("id, company_name").in("id", supplierIds)
      : { data: [] as any[] };
    const supplierMap = new Map(((suppliers ?? []) as any[]).map((s) => [s.id, s.company_name]));

    const meterIds = meterRows.map((m) => m.id);
    const { data: tokens } = meterIds.length
      ? await supabase
          .from("meter_tokens")
          .select("id, meter_id, action, token, units, amount, status, reference, created_at")
          .in("meter_id", meterIds)
          .order("created_at", { ascending: false })
          .limit(50)
      : { data: [] as any[] };
    const tokenRows = (tokens ?? []) as any[];

    const { data: readings } = meterIds.length
      ? await supabase
          .from("meter_readings")
          .select("id, meter_id, reading, consumption, reading_date, reading_type")
          .in("meter_id", meterIds)
          .order("reading_date", { ascending: false })
          .limit(50)
      : { data: [] as any[] };
    const readingRows = (readings ?? []) as any[];

    const { data: payments } = await supabase
      .from("payments")
      .select(
        "id, amount, currency, status, reference, description, paid_at, created_at, payment_method_id, payment_account_id",
      )
      .eq("payee_id", data.id)
      .order("created_at", { ascending: false });
    const paymentRows = (payments ?? []) as any[];
    const methodIds = [...new Set(paymentRows.map((p) => p.payment_method_id).filter(Boolean))];
    const { data: methods } = methodIds.length
      ? await supabase.from("payment_methods").select("id, name").in("id", methodIds)
      : { data: [] as any[] };
    const methodMap = new Map(((methods ?? []) as any[]).map((m) => [m.id, m.name]));

    // Status history is privileged data; read it only after the scope check above.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: userLogs }, { data: assignLogs }] = await Promise.all([
      supabaseAdmin
        .from("user_audit_logs")
        .select("id, action, changes, actor_id, created_at")
        .eq("user_id", data.id)
        .order("created_at", { ascending: false })
        .limit(200),
      supabaseAdmin
        .from("assignment_audit_logs")
        .select("id, action, changes, actor_id, created_at, old_unit_id, new_unit_id")
        .eq("user_id", data.id)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    const actorIds = [
      ...new Set(
        [...(userLogs ?? []), ...(assignLogs ?? [])].map((l: any) => l.actor_id).filter(Boolean),
      ),
    ] as string[];
    const { data: actors } = actorIds.length
      ? await supabaseAdmin.from("users").select("id, name, email").in("id", actorIds)
      : { data: [] as any[] };
    const actorMap = new Map(((actors ?? []) as any[]).map((a) => [a.id, a.name ?? a.email]));

    const history = [
      ...((userLogs ?? []) as any[]).map((l) => ({
        id: l.id as string,
        action: l.action as string,
        previous_status: ((l.changes as any)?.previous_status ?? null) as string | null,
        new_status: ((l.changes as any)?.new_status ?? null) as string | null,
        reason: ((l.changes as any)?.reason ?? (l.changes as any)?.note ?? null) as string | null,
        detail: ((l.changes as any)?.detail ?? null) as string | null,
        actor: (l.actor_id ? (actorMap.get(l.actor_id) ?? "Unknown") : "System") as string,
        created_at: l.created_at as string,
      })),
      ...((assignLogs ?? []) as any[]).map((l) => ({
        id: l.id as string,
        action: `unit_${l.action}` as string,
        previous_status: null,
        new_status: null,
        reason: null,
        detail: ((l.changes as any)?.detail ?? null) as string | null,
        actor: (l.actor_id ? (actorMap.get(l.actor_id) ?? "Unknown") : "System") as string,
        created_at: l.created_at as string,
      })),
    ].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

    await logVendorAction(supabase as never, vendorId, "VENDOR_RESIDENT_VIEWED", {
      type: "resident",
      id: data.id,
    });

    return {
      viewerId: userId,
      resident: {
        id: resident.id as string,
        name: (resident.name ?? null) as string | null,
        email: (resident.email ?? null) as string | null,
        username: (resident.username ?? null) as string | null,
        phone: (resident.phone ?? null) as string | null,
        id_number: (resident.id_number ?? null) as string | null,
        address: (resident.address ?? null) as string | null,
        status: (resident.status ?? "active") as string,
        profile_image: (resident.profile_image ?? null) as string | null,
        bio: (resident.bio ?? null) as string | null,
        notes: (resident.notes ?? null) as string | null,
        move_in_date: (resident.move_in_date ?? null) as string | null,
        created_at: resident.created_at as string,
      },
      assignments: assignmentRows,
      meters: meterRows.map((m) => {
        const meterTokens = tokenRows.filter((t) => t.meter_id === m.id);
        const meterReadings = readingRows.filter((r) => r.meter_id === m.id);
        const lastToken = meterTokens[0] ?? null;
        const lastReading = meterReadings[0] ?? null;
        const assignment = assignmentRows.find((a) => a.unit_id === m.unit_id);
        const credit = meterTokens
          .filter((t) => t.action === "credit" && t.status !== "revoked")
          .reduce((s, t) => s + Number(t.units ?? 0), 0);
        const used = meterReadings.reduce((s, r) => s + Number(r.consumption ?? 0), 0);
        return {
          id: m.id as string,
          meter_number: m.meter_number as string,
          serial_number: m.serial_number as string,
          type: m.type as string,
          status: m.status as string,
          installation_status: (m.installation_status ?? "not_installed") as string,
          installation_date: (m.installation_date ?? null) as string | null,
          supplier_name: (m.supplier_id ? (supplierMap.get(m.supplier_id) ?? null) : null) as
            | string
            | null,
          property_name: assignment?.property_name ?? null,
          unit_number: assignment?.unit_number ?? null,
          zone_name: assignment?.zone_name ?? null,
          price_per_unit: Number(m.price_per_unit ?? 0),
          current_reading: lastReading ? Number(lastReading.reading) : Number(m.initial_reading ?? 0),
          last_reading_at: (lastReading?.reading_date ?? null) as string | null,
          available_credit: Math.max(0, credit - used),
          low_credit: credit - used <= 5,
          last_token: lastToken
            ? {
                token: lastToken.token as string,
                units: Number(lastToken.units ?? 0),
                amount: Number(lastToken.amount ?? 0),
                created_at: lastToken.created_at as string,
              }
            : null,
        };
      }),
      tokens: tokenRows.map((t) => ({
        id: t.id as string,
        meter_id: t.meter_id as string,
        action: t.action as string,
        token: t.token as string,
        units: Number(t.units ?? 0),
        amount: Number(t.amount ?? 0),
        status: t.status as string,
        reference: (t.reference ?? null) as string | null,
        created_at: t.created_at as string,
      })),
      payments: paymentRows.map((p) => ({
        id: p.id as string,
        amount: Number(p.amount ?? 0),
        currency: (p.currency ?? "KES") as string,
        status: p.status as string,
        reference: (p.reference ?? null) as string | null,
        description: (p.description ?? null) as string | null,
        method: (p.payment_method_id ? (methodMap.get(p.payment_method_id) ?? null) : null) as
          | string
          | null,
        paid_at: (p.paid_at ?? null) as string | null,
        created_at: p.created_at as string,
      })),
      history,
    };
  });

const profileFields = {
  username: residentUsername.optional().or(z.literal("")),
  first_name: z.string().trim().max(60).optional().or(z.literal("")),
  middle_name: z.string().trim().max(60).optional().or(z.literal("")),
  last_name: z.string().trim().max(60).optional().or(z.literal("")),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
  id_number: z.string().trim().max(40).optional().or(z.literal("")),
  address: z.string().trim().max(200).optional().or(z.literal("")),
  profile_image: z.string().trim().max(1000).nullable().optional(),
  status: z.enum(["active", "inactive", "suspended", "pending"]).optional(),
};

const fullName = (d: {
  first_name?: string | undefined;
  middle_name?: string | undefined;
  last_name?: string | undefined;
}) =>
  [d.first_name, d.middle_name, d.last_name].map((p) => (p ?? "").trim()).filter(Boolean).join(" ");

export const createVendorResident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        ...profileFields,
        first_name: z.string().trim().min(2, { message: "First name is required" }).max(60),
        last_name: z.string().trim().min(1, { message: "Last name is required" }).max(60),
        email: z.string().trim().email({ message: "Enter a valid email address" }).max(255),
        unit_id: uuid.optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const vendorId = await assertVendor(context as never);

    if (data.unit_id) await assertUnitInScope(supabase as never, data.unit_id);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("email", data.email)
      .maybeSingle();
    if (existing) throw new Error("An account with this email address already exists");

    const name = fullName(data);
    if (data.username) {
      const { data: duplicate } = await supabaseAdmin.from("users").select("id").ilike("username", data.username.replace(/_/g, "\\_")).maybeSingle();
      if (duplicate) throw new Error("This username is already assigned. Choose another.");
    }
    const tempPassword = `${crypto.randomUUID()}Aa1!`;

    const { data: created, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { name },
    });
    if (authError || !created.user) {
      throw new Error(authError?.message ?? "Could not create the resident account");
    }
    const id = created.user.id;

    const { error: profileError } = await supabaseAdmin.from("users").upsert({
      id,
      name,
      email: data.email,
      phone: data.phone || null,
      username: data.username || null,
      id_number: data.id_number || null,
      address: data.address || null,
      profile_image: data.profile_image || null,
      status: data.status ?? "active",
      created_by: userId,
      updated_by: userId,
    });
    if (profileError) { await supabaseAdmin.auth.admin.deleteUser(id); throw new Error(profileError.code === "23505" ? "This username is already assigned. Choose another." : profileError.message); }

    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: id, role: "resident" }, { onConflict: "user_id,role" });

    if (data.unit_id) {
      const { error: assignError } = await supabaseAdmin.from("unit_assignments").insert({
        unit_id: data.unit_id,
        user_id: id,
        role: "resident",
        start_date: new Date().toISOString().slice(0, 10),
        created_by: userId,
        updated_by: userId,
      });
      if (assignError) throw new Error(assignError.message);
      await supabaseAdmin.from("units").update({ status: "occupied" }).eq("id", data.unit_id);
    }

    await recordResidentEvent(supabaseAdmin as never, id, userId, "resident_created", {
      new_status: data.status ?? "active",
      detail: "Resident created from the vendor portal",
    });
    await logVendorAction(
      supabase as never,
      vendorId,
      "VENDOR_RESIDENT_CREATED",
      { type: "resident", id },
      { email: data.email, unit_id: data.unit_id ?? null },
    );

    const { error: setupError } = await supabaseAdmin.auth.resetPasswordForEmail(data.email, { redirectTo: trustedRecoveryUrl(getRequestHeader("origin")) });
    return { ok: true, id, passwordSetupSent: !setupError };
  });

export const updateVendorResident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: uuid,
        ...profileFields,
        email: z.string().trim().email().max(255).optional(),
        name: z.string().trim().max(180).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const vendorId = await assertVendor(context as never);
    await assertResidentInScope(supabase as never, data.id);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const name = data.name?.trim() || fullName(data);
    const patch: Record<string, unknown> = { updated_by: userId };
    if (name) patch["name"] = name;
    if (data.email) patch["email"] = data.email;
    if (data.phone !== undefined) patch["phone"] = data.phone || null;
    if (data.username !== undefined) patch["username"] = data.username || null;
    if (data.id_number !== undefined) patch["id_number"] = data.id_number || null;
    if (data.address !== undefined) patch["address"] = data.address || null;
    if (data.profile_image !== undefined) patch["profile_image"] = data.profile_image;
    if (data.status) patch["status"] = data.status;

    const { error } = await supabaseAdmin
      .from("users")
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    if (data.email) {
      await supabaseAdmin.auth.admin.updateUserById(data.id, { email: data.email });
    }

    const photoChanged = data.profile_image !== undefined;
    await recordResidentEvent(
      supabaseAdmin as never,
      data.id,
      userId,
      photoChanged ? "profile_image_updated" : "profile_updated",
      { detail: photoChanged ? "Profile photo updated" : "Resident profile updated" },
    );
    await logVendorAction(
      supabase as never,
      vendorId,
      photoChanged ? "VENDOR_RESIDENT_PHOTO_UPDATED" : "VENDOR_RESIDENT_UPDATED",
      { type: "resident", id: data.id },
    );

    return { ok: true };
  });

export const setVendorResidentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: uuid,
        status: z.enum(["active", "inactive"]),
        reason: z.string().trim().max(500).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const vendorId = await assertVendor(context as never);
    await assertResidentInScope(supabase as never, data.id);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: before } = await supabaseAdmin
      .from("users")
      .select("status")
      .eq("id", data.id)
      .maybeSingle();

    const { error } = await supabaseAdmin
      .from("users")
      .update({ status: data.status, updated_by: userId })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await recordResidentEvent(
      supabaseAdmin as never,
      data.id,
      userId,
      data.status === "active" ? "activated" : "deactivated",
      {
        previous_status: before?.status ?? null,
        new_status: data.status,
        ...(data.reason ? { reason: data.reason } : {}),
      },
    );
    await logVendorAction(
      supabase as never,
      vendorId,
      data.status === "active" ? "VENDOR_RESIDENT_ACTIVATED" : "VENDOR_RESIDENT_DEACTIVATED",
      { type: "resident", id: data.id },
      { previous_status: before?.status ?? null, reason: data.reason ?? null },
    );

    return { ok: true };
  });

/**
 * Soft delete. Financial, meter and assignment history is preserved; the
 * account is suspended and any live unit assignment is closed.
 */
export const deleteVendorResident = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: uuid, reason: z.string().trim().max(500).optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const vendorId = await assertVendor(context as never);
    await assertResidentInScope(supabase as never, data.id);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: before } = await supabaseAdmin
      .from("users")
      .select("status, notes")
      .eq("id", data.id)
      .maybeSingle();

    const today = new Date().toISOString().slice(0, 10);
    const { data: openAssignments } = await supabaseAdmin
      .from("unit_assignments")
      .select("id, unit_id")
      .eq("user_id", data.id)
      .is("end_date", null);

    for (const a of (openAssignments ?? []) as any[]) {
      await supabaseAdmin.from("unit_assignments").update({ end_date: today, updated_by: userId }).eq("id", a.id);
      await supabaseAdmin.from("units").update({ status: "vacant" }).eq("id", a.unit_id);
    }

    const note = `Archived by vendor on ${today}${data.reason ? ` — ${data.reason}` : ""}`;
    const { error } = await supabaseAdmin
      .from("users")
      .update({
        status: "suspended",
        notes: [before?.notes, note].filter(Boolean).join("\n"),
        updated_by: userId,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await recordResidentEvent(supabaseAdmin as never, data.id, userId, "resident_deleted", {
      previous_status: before?.status ?? null,
      new_status: "suspended",
      ...(data.reason ? { reason: data.reason } : {}),
      detail: "Resident archived (soft delete) — history retained",
    });
    await logVendorAction(
      supabase as never,
      vendorId,
      "VENDOR_RESIDENT_DELETED",
      { type: "resident", id: data.id },
      { reason: data.reason ?? null, soft_delete: true },
    );

    return { ok: true };
  });

export const assignVendorResidentUnit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        resident_id: uuid,
        unit_id: uuid,
        start_date: z
          .string()
          .trim()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        notes: z.string().trim().max(500).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const vendorId = await assertVendor(context as never);
    await assertResidentInScope(supabase as never, data.resident_id);
    await assertUnitInScope(supabase as never, data.unit_id);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: occupied } = await supabaseAdmin
      .from("unit_assignments")
      .select("id, user_id")
      .eq("unit_id", data.unit_id)
      .eq("role", "resident")
      .is("end_date", null);
    const blocking = ((occupied ?? []) as any[]).filter((a) => a.user_id !== data.resident_id);
    if (blocking.length) throw new Error("This unit is already occupied by another resident");

    const start = data.start_date ?? new Date().toISOString().slice(0, 10);

    const { data: current } = await supabaseAdmin
      .from("unit_assignments")
      .select("id, unit_id")
      .eq("user_id", data.resident_id)
      .eq("role", "resident")
      .is("end_date", null);

    const currentRows = (current ?? []) as any[];
    if (currentRows.some((a) => a.unit_id === data.unit_id)) {
      throw new Error("This resident is already assigned to that unit");
    }

    for (const a of currentRows) {
      await supabaseAdmin
        .from("unit_assignments")
        .update({ end_date: start, updated_by: userId })
        .eq("id", a.id);
      await supabaseAdmin.from("units").update({ status: "vacant" }).eq("id", a.unit_id);
    }

    const { error } = await supabaseAdmin.from("unit_assignments").insert({
      unit_id: data.unit_id,
      user_id: data.resident_id,
      role: "resident",
      start_date: start,
      ...(data.notes ? { notes: data.notes } : {}),
      created_by: userId,
      updated_by: userId,
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("units").update({ status: "occupied" }).eq("id", data.unit_id);

    await recordResidentEvent(
      supabaseAdmin as never,
      data.resident_id,
      userId,
      currentRows.length ? "unit_changed" : "unit_assigned",
      { detail: `Unit assignment effective ${start}`, ...(data.notes ? { note: data.notes } : {}) },
    );
    await logVendorAction(
      supabase as never,
      vendorId,
      "VENDOR_RESIDENT_UNIT_ASSIGNED",
      { type: "resident", id: data.resident_id },
      { unit_id: data.unit_id, start_date: start },
    );

    return { ok: true };
  });

export const sendVendorResidentPasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: uuid, redirectTo: z.string().trim().url().max(500).optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const vendorId = await assertVendor(context as never);
    await assertResidentInScope(supabase as never, data.id);

    const { data: profile } = await supabase
      .from("users")
      .select("email")
      .eq("id", data.id)
      .maybeSingle();
    if (!profile?.email) throw new Error("This resident has no email address on file");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(profile.email, {
      ...(data.redirectTo ? { redirectTo: data.redirectTo } : {}),
    });
    if (error) throw new Error(error.message);

    await recordResidentEvent(supabaseAdmin as never, data.id, userId, "password_reset_requested", {
      detail: `Reset email sent to ${profile.email}`,
    });
    await logVendorAction(supabase as never, vendorId, "VENDOR_RESIDENT_PASSWORD_RESET", {
      type: "resident",
      id: data.id,
    });

    return { ok: true, email: profile.email as string };
  });
