import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertVendor, logVendorAction } from "@/lib/vendor.server";

/**
 * Vendor-scoped landlord management.
 *
 * Reads always go through the caller's RLS-bound client, so a vendor only ever
 * sees landlords, properties, units, meters and payments inside their own
 * scope. Writes need the service role (auth admin + profile tables are
 * admin-only), so each one re-verifies the target through the RLS client
 * before the privileged call is made.
 */

type Client = { from: (t: string) => any; rpc: (n: string, a?: any) => any };

const uuid = z.string().uuid();

export type VendorLandlordRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  id_number: string | null;
  address: string | null;
  status: string;
  profile_image: string | null;
  created_at: string;
  property_count: number;
  unit_count: number;
  assigned_unit_count: number;
  zone_names: string[];
};

async function scopeGeography(supabase: Client) {
  const { data: props, error } = await supabase
    .from("properties")
    .select(
      "id, name, code, property_type, status, address_line1, address_line2, city, zone_id, landlord_id, owner_type, number_of_units, created_at",
    );
  if (error) throw new Error(error.message);
  const propertyRows = (props ?? []) as any[];

  const zoneIds = [...new Set(propertyRows.map((p) => p.zone_id).filter((z) => z != null))];
  const { data: zones } = zoneIds.length
    ? await supabase.from("zones").select("zone_id, zone_name").in("zone_id", zoneIds)
    : { data: [] as any[] };
  const zoneMap = new Map<number, string>(
    ((zones ?? []) as any[]).map((z): [number, string] => [z.zone_id, z.zone_name]),
  );

  const propertyMap = new Map<string, any>(
    propertyRows.map((p): [string, any] => [
      p.id,
      {
        ...p,
        zone_name: p.zone_id != null ? (zoneMap.get(p.zone_id) ?? null) : null,
        address: [p.address_line1, p.address_line2, p.city].filter(Boolean).join(", ") || null,
      },
    ]),
  );

  const { data: units } = await supabase
    .from("units")
    .select("id, unit_number, unit_type, status, property_id, created_at");
  const unitRows = (units ?? []) as any[];
  const unitMap = new Map<string, any>(
    unitRows.map((u): [string, any] => [u.id, { ...u, property: propertyMap.get(u.property_id) ?? null }]),
  );

  return { propertyMap, unitMap };
}

async function assertLandlordInScope(supabase: Client, landlordId: string) {
  const { data, error } = await supabase.from("users").select("id").eq("id", landlordId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Access denied");
  return landlordId;
}

async function assertUnitInScope(supabase: Client, unitId: string) {
  const { data, error } = await supabase.from("units").select("id").eq("id", unitId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Access denied");
  return unitId;
}

async function recordLandlordEvent(
  admin: Client,
  landlordId: string,
  actorId: string,
  action: string,
  changes: Record<string, unknown>,
) {
  await admin.from("user_audit_logs").insert({
    user_id: landlordId,
    actor_id: actorId,
    action,
    changes,
  });
}

/** Ids of the users in `candidates` that actually hold the landlord role. */
async function landlordRoleIds(candidates: string[]) {
  if (!candidates.length) return new Set<string>();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("role", "landlord")
    .in("user_id", candidates);
  return new Set(((data ?? []) as any[]).map((r) => r.user_id as string));
}

export const listVendorLandlords = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const vendorId = await assertVendor(context as never);

    const { data: users, error } = await supabase
      .from("users")
      .select("id, name, email, phone, status, profile_image, created_at, id_number, address");
    if (error) throw new Error(error.message);
    const userRows = (users ?? []) as any[];

    const { propertyMap, unitMap } = await scopeGeography(supabase as never);

    const { data: assignments } = await supabase
      .from("unit_assignments")
      .select("unit_id, user_id, end_date, role")
      .eq("role", "landlord");
    const activeAssignments = ((assignments ?? []) as any[]).filter((a) => !a.end_date);

    const roleIds = await landlordRoleIds(userRows.map((u) => u.id));

    const rows: VendorLandlordRow[] = userRows
      .filter((u) => roleIds.has(u.id))
      .map((u) => {
        const owned = [...propertyMap.values()].filter((p: any) => p.landlord_id === u.id);
        const ownedIds = new Set(owned.map((p: any) => p.id));
        const unitsInProperties = [...unitMap.values()].filter((unit: any) =>
          ownedIds.has(unit.property_id),
        );
        const assigned = activeAssignments.filter((a) => a.user_id === u.id);
        const zoneNames = [
          ...new Set(
            [
              ...owned.map((p: any) => p.zone_name),
              ...assigned.map((a) => unitMap.get(a.unit_id)?.property?.zone_name),
            ].filter(Boolean) as string[],
          ),
        ];
        return {
          id: u.id as string,
          name: (u.name ?? null) as string | null,
          email: (u.email ?? null) as string | null,
          phone: (u.phone ?? null) as string | null,
          id_number: (u.id_number ?? null) as string | null,
          address: (u.address ?? null) as string | null,
          status: (u.status ?? "active") as string,
          profile_image: (u.profile_image ?? null) as string | null,
          created_at: u.created_at as string,
          property_count: owned.length,
          unit_count: unitsInProperties.length,
          assigned_unit_count: assigned.length,
          zone_names: zoneNames,
        };
      });

    rows.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
    return { vendorId, landlords: rows };
  });

export const listVendorLandlordUnits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    await assertVendor(context as never);

    const { unitMap } = await scopeGeography(supabase as never);

    const { data: assignments } = await supabase
      .from("unit_assignments")
      .select("unit_id, user_id, end_date, role")
      .eq("role", "landlord");
    const holder = new Map<string, string>();
    for (const a of ((assignments ?? []) as any[]).filter((a) => !a.end_date)) {
      holder.set(a.unit_id, a.user_id);
    }
    const holderIds = [...new Set([...holder.values()])];
    const { data: holders } = holderIds.length
      ? await supabase.from("users").select("id, name, email").in("id", holderIds)
      : { data: [] as any[] };
    const holderMap = new Map(((holders ?? []) as any[]).map((u) => [u.id, u]));

    const units = [...unitMap.values()].map((u: any) => {
      const ownerId = holder.get(u.id) ?? u.property?.landlord_id ?? null;
      const owner = ownerId ? holderMap.get(ownerId) : null;
      return {
        id: u.id as string,
        unit_number: u.unit_number as string,
        unit_type: (u.unit_type ?? null) as string | null,
        status: (u.status ?? "vacant") as string,
        property_id: (u.property?.id ?? null) as string | null,
        property_name: (u.property?.name ?? null) as string | null,
        property_address: (u.property?.address ?? null) as string | null,
        zone_id: (u.property?.zone_id ?? null) as number | null,
        zone_name: (u.property?.zone_name ?? null) as string | null,
        occupant_id: (holder.get(u.id) ?? null) as string | null,
        occupant_name: (owner?.name ?? owner?.email ?? null) as string | null,
      };
    });
    units.sort(
      (a, b) =>
        (a.property_name ?? "").localeCompare(b.property_name ?? "") ||
        a.unit_number.localeCompare(b.unit_number),
    );
    return { units };
  });

export const getVendorLandlord = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const vendorId = await assertVendor(context as never);

    const { data: landlord, error } = await supabase
      .from("users")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!landlord) throw new Error("Access denied");

    const roleIds = await landlordRoleIds([data.id]);
    if (!roleIds.has(data.id)) throw new Error("Access denied");

    const { propertyMap, unitMap } = await scopeGeography(supabase as never);

    const properties = [...propertyMap.values()]
      .filter((p: any) => p.landlord_id === data.id)
      .map((p: any) => ({
        id: p.id as string,
        name: p.name as string,
        code: (p.code ?? null) as string | null,
        property_type: (p.property_type ?? null) as string | null,
        address: (p.address ?? null) as string | null,
        zone_name: (p.zone_name ?? null) as string | null,
        status: (p.status ?? "active") as string,
        number_of_units: (p.number_of_units ?? null) as number | null,
        unit_count: [...unitMap.values()].filter((u: any) => u.property_id === p.id).length,
        created_at: p.created_at as string,
      }));

    const { data: assignments } = await supabase
      .from("unit_assignments")
      .select("id, unit_id, start_date, end_date, notes, role")
      .eq("user_id", data.id)
      .eq("role", "landlord")
      .order("start_date", { ascending: false });

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
        zone_name: (property?.zone_name ?? null) as string | null,
        start_date: (a.start_date ?? null) as string | null,
        end_date: (a.end_date ?? null) as string | null,
        notes: (a.notes ?? null) as string | null,
        current: !a.end_date,
      };
    });

    // Meters on the landlord's properties and assigned units.
    const ownedPropertyIds = new Set(properties.map((p) => p.id));
    const relevantUnitIds = new Set<string>([
      ...[...unitMap.values()]
        .filter((u: any) => ownedPropertyIds.has(u.property_id))
        .map((u: any) => u.id as string),
      ...assignmentRows.map((a) => a.unit_id),
    ]);

    const { data: meters } = relevantUnitIds.size
      ? await supabase
          .from("meters")
          .select(
            "id, meter_number, serial_number, type, status, installation_status, installation_date, unit_id, supplier_id, price_per_unit, initial_reading",
          )
          .in("unit_id", [...relevantUnitIds])
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
          .select("id, meter_id, action, token, units, amount, status, created_at")
          .in("meter_id", meterIds)
          .order("created_at", { ascending: false })
          .limit(100)
      : { data: [] as any[] };
    const tokenRows = (tokens ?? []) as any[];

    const { data: readings } = meterIds.length
      ? await supabase
          .from("meter_readings")
          .select("id, meter_id, reading, consumption, reading_date")
          .in("meter_id", meterIds)
          .order("reading_date", { ascending: false })
          .limit(100)
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

    const { data: accounts } = await supabase
      .from("payment_method_accounts")
      .select(
        "id, payment_method_id, account_name, account_number, bank_name, branch, paybill_number, is_active, is_default, created_at",
      )
      .eq("landlord_id", data.id);
    const accountRows = (accounts ?? []) as any[];
    const accountMethodIds = [...new Set(accountRows.map((a) => a.payment_method_id).filter(Boolean))];
    const { data: accountMethods } = accountMethodIds.length
      ? await supabase.from("payment_methods").select("id, name").in("id", accountMethodIds)
      : { data: [] as any[] };
    const accountMethodMap = new Map(((accountMethods ?? []) as any[]).map((m) => [m.id, m.name]));

    // Status history is privileged; read it only after the scope check above.
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
        .select("id, action, changes, actor_id, created_at")
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

    await logVendorAction(supabase as never, vendorId, "VENDOR_LANDLORD_VIEWED", {
      type: "landlord",
      id: data.id,
    });

    return {
      viewerId: userId,
      landlord: {
        id: landlord.id as string,
        name: (landlord.name ?? null) as string | null,
        email: (landlord.email ?? null) as string | null,
        phone: (landlord.phone ?? null) as string | null,
        id_number: (landlord.id_number ?? null) as string | null,
        address: (landlord.address ?? null) as string | null,
        status: (landlord.status ?? "active") as string,
        profile_image: (landlord.profile_image ?? null) as string | null,
        notes: (landlord.notes ?? null) as string | null,
        created_at: landlord.created_at as string,
      },
      properties,
      assignments: assignmentRows,
      meters: meterRows.map((m) => {
        const meterTokens = tokenRows.filter((t) => t.meter_id === m.id);
        const meterReadings = readingRows.filter((r) => r.meter_id === m.id);
        const lastToken = meterTokens[0] ?? null;
        const lastReading = meterReadings[0] ?? null;
        const unit = unitMap.get(m.unit_id);
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
          property_name: (unit?.property?.name ?? null) as string | null,
          unit_number: (unit?.unit_number ?? null) as string | null,
          zone_name: (unit?.property?.zone_name ?? null) as string | null,
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
      payment_accounts: accountRows.map((a) => ({
        id: a.id as string,
        method: (a.payment_method_id ? (accountMethodMap.get(a.payment_method_id) ?? null) : null) as
          | string
          | null,
        account_name: (a.account_name ?? null) as string | null,
        account_number: (a.account_number ?? null) as string | null,
        bank_name: (a.bank_name ?? null) as string | null,
        branch: (a.branch ?? null) as string | null,
        paybill_number: (a.paybill_number ?? null) as string | null,
        is_active: Boolean(a.is_active),
        is_default: Boolean(a.is_default),
        created_at: a.created_at as string,
      })),
      history,
    };
  });

const profileFields = {
  first_name: z.string().trim().max(60).optional().or(z.literal("")),
  middle_name: z.string().trim().max(60).optional().or(z.literal("")),
  last_name: z.string().trim().max(60).optional().or(z.literal("")),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
  id_number: z.string().trim().max(40).optional().or(z.literal("")),
  address: z.string().trim().max(200).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  profile_image: z.string().trim().max(1000).nullable().optional(),
  status: z.enum(["active", "inactive", "suspended", "pending"]).optional(),
};

const fullName = (d: {
  first_name?: string | undefined;
  middle_name?: string | undefined;
  last_name?: string | undefined;
}) => [d.first_name, d.middle_name, d.last_name].map((p) => (p ?? "").trim()).filter(Boolean).join(" ");

export const createVendorLandlord = createServerFn({ method: "POST" })
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

    if (data.phone) {
      const { data: samePhone } = await supabaseAdmin
        .from("users")
        .select("id")
        .eq("phone", data.phone)
        .maybeSingle();
      if (samePhone) throw new Error("An account with this phone number already exists");
    }
    if (data.id_number) {
      const { data: sameId } = await supabaseAdmin
        .from("users")
        .select("id")
        .eq("id_number", data.id_number)
        .maybeSingle();
      if (sameId) throw new Error("An account with this identification number already exists");
    }

    const name = fullName(data);
    const tempPassword = `Sm${Math.random().toString(36).slice(2, 10)}${Math.floor(Math.random() * 9000 + 1000)}`;

    const { data: created, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { name },
    });
    if (authError || !created.user) {
      throw new Error(authError?.message ?? "Could not create the landlord account");
    }
    const id = created.user.id;

    const { error: profileError } = await supabaseAdmin.from("users").upsert({
      id,
      name,
      email: data.email,
      phone: data.phone || null,
      id_number: data.id_number || null,
      address: data.address || null,
      notes: data.notes || null,
      profile_image: data.profile_image || null,
      status: data.status ?? "active",
      created_by: userId,
      updated_by: userId,
    });
    if (profileError) throw new Error(profileError.message);

    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: id, role: "landlord" }, { onConflict: "user_id,role" });

    if (data.unit_id) {
      const { error: assignError } = await supabaseAdmin.from("unit_assignments").insert({
        unit_id: data.unit_id,
        user_id: id,
        role: "landlord",
        start_date: new Date().toISOString().slice(0, 10),
        created_by: userId,
        updated_by: userId,
      });
      if (assignError) throw new Error(assignError.message);
    }

    await recordLandlordEvent(supabaseAdmin as never, id, userId, "landlord_created", {
      new_status: data.status ?? "active",
      detail: "Landlord created from the vendor portal",
    });
    await logVendorAction(
      supabase as never,
      vendorId,
      "VENDOR_LANDLORD_CREATED",
      { type: "landlord", id },
      { email: data.email, unit_id: data.unit_id ?? null },
    );

    return { ok: true, id };
  });

export const updateVendorLandlord = createServerFn({ method: "POST" })
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
    await assertLandlordInScope(supabase as never, data.id);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.email) {
      const { data: clash } = await supabaseAdmin
        .from("users")
        .select("id")
        .eq("email", data.email)
        .neq("id", data.id)
        .maybeSingle();
      if (clash) throw new Error("Another account already uses this email address");
    }

    const name = data.name?.trim() || fullName(data);
    const patch: Record<string, unknown> = { updated_by: userId };
    if (name) patch["name"] = name;
    if (data.email) patch["email"] = data.email;
    if (data.phone !== undefined) patch["phone"] = data.phone || null;
    if (data.id_number !== undefined) patch["id_number"] = data.id_number || null;
    if (data.address !== undefined) patch["address"] = data.address || null;
    if (data.notes !== undefined) patch["notes"] = data.notes || null;
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
    await recordLandlordEvent(
      supabaseAdmin as never,
      data.id,
      userId,
      photoChanged ? "profile_image_updated" : "profile_updated",
      { detail: photoChanged ? "Profile photo updated" : "Landlord profile updated" },
    );
    await logVendorAction(
      supabase as never,
      vendorId,
      photoChanged ? "VENDOR_LANDLORD_PHOTO_UPDATED" : "VENDOR_LANDLORD_UPDATED",
      { type: "landlord", id: data.id },
    );

    return { ok: true };
  });

export const setVendorLandlordStatus = createServerFn({ method: "POST" })
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
    await assertLandlordInScope(supabase as never, data.id);

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

    await recordLandlordEvent(
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
      data.status === "active" ? "VENDOR_LANDLORD_ACTIVATED" : "VENDOR_LANDLORD_DEACTIVATED",
      { type: "landlord", id: data.id },
      { previous_status: before?.status ?? null, reason: data.reason ?? null },
    );

    return { ok: true };
  });

/** Soft delete — properties, units, payments and meter history are preserved. */
export const deleteVendorLandlord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: uuid, reason: z.string().trim().max(500).optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const vendorId = await assertVendor(context as never);
    await assertLandlordInScope(supabase as never, data.id);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: before } = await supabaseAdmin
      .from("users")
      .select("status, notes")
      .eq("id", data.id)
      .maybeSingle();

    const today = new Date().toISOString().slice(0, 10);
    const { data: openAssignments } = await supabaseAdmin
      .from("unit_assignments")
      .select("id")
      .eq("user_id", data.id)
      .eq("role", "landlord")
      .is("end_date", null);

    for (const a of (openAssignments ?? []) as any[]) {
      await supabaseAdmin
        .from("unit_assignments")
        .update({ end_date: today, updated_by: userId })
        .eq("id", a.id);
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

    await recordLandlordEvent(supabaseAdmin as never, data.id, userId, "landlord_deleted", {
      previous_status: before?.status ?? null,
      new_status: "suspended",
      ...(data.reason ? { reason: data.reason } : {}),
      detail: "Landlord archived (soft delete) — history retained",
    });
    await logVendorAction(
      supabase as never,
      vendorId,
      "VENDOR_LANDLORD_DELETED",
      { type: "landlord", id: data.id },
      { reason: data.reason ?? null, soft_delete: true },
    );

    return { ok: true };
  });

export const assignVendorLandlordUnit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        landlord_id: uuid,
        unit_id: uuid,
        start_date: z
          .string()
          .trim()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        notes: z.string().trim().max(500).optional(),
        replace_current: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const vendorId = await assertVendor(context as never);
    await assertLandlordInScope(supabase as never, data.landlord_id);
    await assertUnitInScope(supabase as never, data.unit_id);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: held } = await supabaseAdmin
      .from("unit_assignments")
      .select("id, user_id")
      .eq("unit_id", data.unit_id)
      .eq("role", "landlord")
      .is("end_date", null);
    const heldRows = (held ?? []) as any[];
    if (heldRows.some((a) => a.user_id === data.landlord_id)) {
      throw new Error("This landlord is already assigned to that unit");
    }
    if (heldRows.length) {
      throw new Error("This unit is already assigned to another landlord");
    }

    const start = data.start_date ?? new Date().toISOString().slice(0, 10);

    const { error } = await supabaseAdmin.from("unit_assignments").insert({
      unit_id: data.unit_id,
      user_id: data.landlord_id,
      role: "landlord",
      start_date: start,
      ...(data.notes ? { notes: data.notes } : {}),
      created_by: userId,
      updated_by: userId,
    });
    if (error) throw new Error(error.message);

    await recordLandlordEvent(supabaseAdmin as never, data.landlord_id, userId, "unit_assigned", {
      detail: `Unit assignment effective ${start}`,
      ...(data.notes ? { note: data.notes } : {}),
    });
    await logVendorAction(
      supabase as never,
      vendorId,
      "VENDOR_LANDLORD_UNIT_ASSIGNED",
      { type: "landlord", id: data.landlord_id },
      { unit_id: data.unit_id, start_date: start },
    );

    return { ok: true };
  });

export const removeVendorLandlordUnit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ landlord_id: uuid, assignment_id: uuid }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const vendorId = await assertVendor(context as never);
    await assertLandlordInScope(supabase as never, data.landlord_id);

    // The assignment must be visible to the caller's scope before it is touched.
    const { data: visible, error: readError } = await supabase
      .from("unit_assignments")
      .select("id, unit_id, user_id, end_date")
      .eq("id", data.assignment_id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!visible || visible.user_id !== data.landlord_id) throw new Error("Access denied");
    if (visible.end_date) throw new Error("That assignment has already ended");
    await assertUnitInScope(supabase as never, visible.unit_id as string);

    const today = new Date().toISOString().slice(0, 10);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("unit_assignments")
      .update({ end_date: today, updated_by: userId })
      .eq("id", data.assignment_id);
    if (error) throw new Error(error.message);

    await recordLandlordEvent(
      supabaseAdmin as never,
      data.landlord_id,
      userId,
      "unit_assignment_removed",
      { detail: `Assignment ended ${today}` },
    );
    await logVendorAction(
      supabase as never,
      vendorId,
      "VENDOR_LANDLORD_UNIT_REMOVED",
      { type: "landlord", id: data.landlord_id },
      { assignment_id: data.assignment_id },
    );

    return { ok: true };
  });

export const sendVendorLandlordPasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: uuid, redirectTo: z.string().trim().url().max(500).optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const vendorId = await assertVendor(context as never);
    await assertLandlordInScope(supabase as never, data.id);

    const { data: profile } = await supabase
      .from("users")
      .select("email")
      .eq("id", data.id)
      .maybeSingle();
    if (!profile?.email) throw new Error("This landlord has no email address on file");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(profile.email, {
      ...(data.redirectTo ? { redirectTo: data.redirectTo } : {}),
    });
    if (error) throw new Error(error.message);

    await recordLandlordEvent(supabaseAdmin as never, data.id, userId, "password_reset_requested", {
      detail: `Reset email sent to ${profile.email}`,
    });
    await logVendorAction(supabase as never, vendorId, "VENDOR_LANDLORD_PASSWORD_RESET", {
      type: "landlord",
      id: data.id,
    });

    return { ok: true, email: profile.email as string };
  });
