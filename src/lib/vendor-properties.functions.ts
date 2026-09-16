import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertVendor, logVendorAction } from "@/lib/vendor.server";

/**
 * Vendor-scoped property management.
 *
 * Reads go through the caller's RLS-bound client, so a vendor only ever sees
 * properties inside their assigned zones. Writes need the service role, so
 * every mutation re-verifies the target (and any zone/owner it points at)
 * through the RLS client before the privileged call runs.
 */

type Client = { from: (t: string) => any; rpc: (n: string, a?: any) => any };

const uuid = z.string().uuid();
const text = (max: number) => z.string().trim().max(max).nullable().optional();

const SIGNED_TTL = 60 * 60 * 8;

export type VendorPropertyRow = {
  id: string;
  name: string;
  code: string | null;
  property_type: string;
  building_category: string | null;
  subtype: string | null;
  status: string;
  owner_type: string;
  owner_id: string | null;
  owner_name: string | null;
  address: string | null;
  city: string | null;
  zone_id: number | null;
  zone_name: string | null;
  number_of_units: number | null;
  unit_count: number;
  occupied_units: number;
  available_units: number;
  photo_url: string | null;
  created_at: string;
};

/** Zone ids the authenticated vendor is allowed to work in (owned + assigned). */
async function vendorZoneIds(supabase: Client, vendorId: string) {
  const { data, error } = await supabase.rpc("vendor_zone_ids", { _vendor: vendorId });
  if (error) throw new Error(error.message);
  const ids = new Set(((data ?? []) as any[]).map((z) => Number(z.zone_id)));
  const { data: owned } = await supabase
    .from("zones")
    .select("zone_id")
    .eq("vendor_id", vendorId);
  for (const z of (owned ?? []) as any[]) ids.add(Number(z.zone_id));
  return ids;
}

async function assertPropertyInScope(supabase: Client, propertyId: string) {
  const { data, error } = await supabase
    .from("properties")
    .select("id, zone_id, landlord_id, owner_type, status")
    .eq("id", propertyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Access denied");
  return data as any;
}

async function assertZoneInScope(supabase: Client, vendorId: string, zoneId: number | null) {
  if (zoneId == null) return;
  const zones = await vendorZoneIds(supabase, vendorId);
  if (!zones.has(Number(zoneId))) throw new Error("Access denied");
}

/** Owner must be a real user the vendor can already see inside their scope. */
async function assertOwnerVisible(supabase: Client, ownerId: string | null) {
  if (!ownerId) return;
  const { data, error } = await supabase.from("users").select("id").eq("id", ownerId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Access denied");
}

async function signPhoto(admin: any, path: string | null) {
  if (!path) return null;
  const { data } = await admin.storage.from("property-photos").createSignedUrl(path, SIGNED_TTL);
  return (data?.signedUrl ?? null) as string | null;
}

async function recordPropertyEvent(
  admin: Client,
  propertyId: string,
  propertyName: string | null,
  actorId: string,
  action: string,
  changes: Record<string, unknown>,
) {
  await admin.from("property_audit_logs").insert({
    property_id: propertyId,
    property_name: propertyName,
    actor_id: actorId,
    action,
    changes,
  });
}

export const listVendorProperties = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const vendorId = await assertVendor(context as never);

    const { data: props, error } = await supabase
      .from("properties")
      .select(
        "id, name, code, property_type, building_category, subtype, status, owner_type, landlord_id, address_line1, address_line2, city, state, country, postal_code, estate, building_number, zone_id, number_of_units, created_at",
      )
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    const rows = (props ?? []) as any[];
    const ids = rows.map((p) => p.id as string);

    const zoneIds = [...new Set(rows.map((p) => p.zone_id).filter((z) => z != null))];
    const { data: zones } = zoneIds.length
      ? await supabase.from("zones").select("zone_id, zone_name").in("zone_id", zoneIds)
      : { data: [] as any[] };
    const zoneMap = new Map<number, string>(
      ((zones ?? []) as any[]).map((z): [number, string] => [z.zone_id, z.zone_name]),
    );

    const ownerIds = [...new Set(rows.map((p) => p.landlord_id).filter(Boolean))] as string[];
    const { data: owners } = ownerIds.length
      ? await supabase.from("users").select("id, name, email").in("id", ownerIds)
      : { data: [] as any[] };
    const ownerMap = new Map(((owners ?? []) as any[]).map((o) => [o.id, o]));

    const { data: units } = ids.length
      ? await supabase.from("units").select("id, property_id, status").in("property_id", ids)
      : { data: [] as any[] };
    const unitRows = (units ?? []) as any[];

    const { data: photos } = ids.length
      ? await supabase
          .from("property_photos")
          .select("property_id, storage_path, is_primary, created_at")
          .in("property_id", ids)
          .order("created_at", { ascending: true })
      : { data: [] as any[] };
    const photoRows = (photos ?? []) as any[];

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const photoByProperty = new Map<string, string>();
    for (const p of photoRows) {
      if (!photoByProperty.has(p.property_id) || p.is_primary) {
        photoByProperty.set(p.property_id, p.storage_path);
      }
    }
    const signed = new Map<string, string | null>();
    await Promise.all(
      [...photoByProperty.entries()].map(async ([propertyId, path]) => {
        signed.set(propertyId, await signPhoto(supabaseAdmin, path));
      }),
    );

    const properties: VendorPropertyRow[] = rows.map((p) => {
      const propertyUnits = unitRows.filter((u) => u.property_id === p.id);
      const occupied = propertyUnits.filter((u) => u.status === "occupied").length;
      const owner = p.landlord_id ? ownerMap.get(p.landlord_id) : null;
      return {
        id: p.id as string,
        name: p.name as string,
        code: (p.code ?? null) as string | null,
        property_type: (p.property_type ?? "building") as string,
        building_category: (p.building_category ?? null) as string | null,
        subtype: (p.subtype ?? null) as string | null,
        status: (p.status ?? "active") as string,
        owner_type: (p.owner_type ?? "landlord") as string,
        owner_id: (p.landlord_id ?? null) as string | null,
        owner_name: ((owner?.name ?? owner?.email) ?? null) as string | null,
        address:
          [p.building_number, p.address_line1, p.address_line2, p.estate, p.city]
            .filter(Boolean)
            .join(", ") || null,
        city: (p.city ?? null) as string | null,
        zone_id: (p.zone_id ?? null) as number | null,
        zone_name: (p.zone_id != null ? (zoneMap.get(p.zone_id) ?? null) : null) as string | null,
        number_of_units: (p.number_of_units ?? null) as number | null,
        unit_count: propertyUnits.length,
        occupied_units: occupied,
        available_units: propertyUnits.length - occupied,
        photo_url: signed.get(p.id) ?? null,
        created_at: p.created_at as string,
      };
    });

    return { vendorId, properties };
  });

/** Zones and owner candidates the vendor may pick when creating or editing. */
export const listVendorPropertyOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const vendorId = await assertVendor(context as never);

    const allowed = await vendorZoneIds(supabase as never, vendorId);
    const { data: zones } = allowed.size
      ? await supabase
          .from("zones")
          .select("zone_id, zone_name, status")
          .in("zone_id", [...allowed])
          .order("zone_name")
      : { data: [] as any[] };

    const { data: users } = await supabase
      .from("users")
      .select("id, name, email, phone, status")
      .order("name");
    const userRows = (users ?? []) as any[];

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = userRows.length
      ? await supabaseAdmin
          .from("user_roles")
          .select("user_id, role")
          .in("role", ["landlord", "agent", "vendor"])
          .in(
            "user_id",
            userRows.map((u) => u.id),
          )
      : { data: [] as any[] };
    const roleMap = new Map<string, string[]>();
    for (const r of ((roles ?? []) as any[])) {
      roleMap.set(r.user_id, [...(roleMap.get(r.user_id) ?? []), r.role]);
    }

    const owners = userRows
      .filter((u) => roleMap.has(u.id))
      .map((u) => ({
        id: u.id as string,
        name: (u.name ?? u.email ?? "Unnamed") as string,
        email: (u.email ?? null) as string | null,
        phone: (u.phone ?? null) as string | null,
        status: (u.status ?? "active") as string,
        roles: roleMap.get(u.id) ?? [],
      }));

    return {
      zones: ((zones ?? []) as any[]).map((z) => ({
        zone_id: z.zone_id as number,
        zone_name: z.zone_name as string,
        status: (z.status ?? "active") as string,
      })),
      owners,
    };
  });

export const getVendorProperty = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const vendorId = await assertVendor(context as never);

    const { data: property, error } = await supabase
      .from("properties")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!property) throw new Error("Access denied");

    const zoneId = (property as any).zone_id as number | null;
    const { data: zone } = zoneId != null
      ? await supabase.from("zones").select("zone_id, zone_name").eq("zone_id", zoneId).maybeSingle()
      : { data: null as any };

    const ownerId = (property as any).landlord_id as string | null;
    const { data: owner } = ownerId
      ? await supabase
          .from("users")
          .select("id, name, email, phone, status, profile_image, address")
          .eq("id", ownerId)
          .maybeSingle()
      : { data: null as any };

    let ownerStats = { property_count: 0, unit_count: 0 };
    if (ownerId) {
      const { data: ownerProps } = await supabase
        .from("properties")
        .select("id")
        .eq("landlord_id", ownerId);
      const ownerPropIds = ((ownerProps ?? []) as any[]).map((p) => p.id);
      const { data: ownerUnits } = ownerPropIds.length
        ? await supabase.from("units").select("id").in("property_id", ownerPropIds)
        : { data: [] as any[] };
      ownerStats = {
        property_count: ownerPropIds.length,
        unit_count: ((ownerUnits ?? []) as any[]).length,
      };
    }

    const { data: units } = await supabase
      .from("units")
      .select("*")
      .eq("property_id", data.id)
      .order("unit_number");
    const unitRows = (units ?? []) as any[];
    const unitIds = unitRows.map((u) => u.id as string);

    const { data: assignments } = unitIds.length
      ? await supabase
          .from("unit_assignments")
          .select("id, unit_id, user_id, role, start_date, end_date, notes")
          .in("unit_id", unitIds)
          .order("start_date", { ascending: false })
      : { data: [] as any[] };
    const assignmentRows = (assignments ?? []) as any[];

    const personIds = [...new Set(assignmentRows.map((a) => a.user_id))];
    const { data: people } = personIds.length
      ? await supabase
          .from("users")
          .select("id, name, email, phone, status, profile_image")
          .in("id", personIds)
      : { data: [] as any[] };
    const peopleMap = new Map(((people ?? []) as any[]).map((p) => [p.id, p]));

    const { data: meters } = unitIds.length
      ? await supabase
          .from("meters")
          .select("id, meter_number, serial_number, type, status, installation_status, unit_id")
          .in("unit_id", unitIds)
      : { data: [] as any[] };
    const meterRows = (meters ?? []) as any[];

    const { data: photos } = await supabase
      .from("property_photos")
      .select("id, storage_path, caption, category, is_primary, uploaded_by, created_at")
      .eq("property_id", data.id)
      .order("created_at", { ascending: false });
    const photoRows = (photos ?? []) as any[];

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const uploaderIds = [...new Set(photoRows.map((p) => p.uploaded_by).filter(Boolean))];
    const { data: uploaders } = uploaderIds.length
      ? await supabaseAdmin.from("users").select("id, name, email").in("id", uploaderIds)
      : { data: [] as any[] };
    const uploaderMap = new Map(((uploaders ?? []) as any[]).map((u) => [u.id, u.name ?? u.email]));

    const signedPhotos = await Promise.all(
      photoRows.map(async (p) => ({
        id: p.id as string,
        url: await signPhoto(supabaseAdmin, p.storage_path as string),
        storage_path: p.storage_path as string,
        caption: (p.caption ?? null) as string | null,
        category: (p.category ?? "other") as string,
        is_primary: Boolean(p.is_primary),
        uploaded_by: (p.uploaded_by ? (uploaderMap.get(p.uploaded_by) ?? "Unknown") : "Unknown") as string,
        created_at: p.created_at as string,
      })),
    );

    // Timeline is privileged; only read after the scope check above succeeded.
    const [{ data: propLogs }, { data: addressLogs }, { data: unitLogs }, { data: assignLogs }] =
      await Promise.all([
        supabaseAdmin
          .from("property_audit_logs")
          .select("id, action, changes, actor_id, created_at")
          .eq("property_id", data.id)
          .order("created_at", { ascending: false })
          .limit(200),
        supabaseAdmin
          .from("address_audit_logs")
          .select("id, action, changes, actor_id, created_at")
          .eq("property_id", data.id)
          .order("created_at", { ascending: false })
          .limit(200),
        unitIds.length
          ? supabaseAdmin
              .from("unit_audit_logs")
              .select("id, unit_id, action, changes, actor_id, created_at")
              .in("unit_id", unitIds)
              .order("created_at", { ascending: false })
              .limit(300)
          : Promise.resolve({ data: [] as any[] }),
        unitIds.length
          ? supabaseAdmin
              .from("assignment_audit_logs")
              .select("id, action, changes, actor_id, created_at, new_unit_id, old_unit_id, user_id")
              .order("created_at", { ascending: false })
              .limit(300)
          : Promise.resolve({ data: [] as any[] }),
      ]);

    const unitLabel = new Map(unitRows.map((u) => [u.id as string, u.unit_number as string]));
    const actorIds = [
      ...new Set(
        [
          ...((propLogs ?? []) as any[]),
          ...((addressLogs ?? []) as any[]),
          ...((unitLogs ?? []) as any[]),
          ...((assignLogs ?? []) as any[]),
        ]
          .map((l) => l.actor_id)
          .filter(Boolean),
      ),
    ];
    const { data: actors } = actorIds.length
      ? await supabaseAdmin.from("users").select("id, name, email").in("id", actorIds)
      : { data: [] as any[] };
    const actorMap = new Map(((actors ?? []) as any[]).map((a) => [a.id, a.name ?? a.email]));
    const actorName = (id: string | null) => (id ? (actorMap.get(id) ?? "Unknown") : "System");

    const describe = (changes: any) => {
      if (!changes || typeof changes !== "object") return { previous: null, next: null };
      const entries = Object.entries(changes as Record<string, any>).filter(
        ([, v]) => v && typeof v === "object" && ("old" in v || "new" in v),
      );
      if (!entries.length) return { previous: null, next: null };
      return {
        previous:
          entries.map(([k, v]) => `${k}: ${v.old ?? "—"}`).join("; ") || null,
        next: entries.map(([k, v]) => `${k}: ${v.new ?? "—"}`).join("; ") || null,
      };
    };

    const timeline = [
      ...((propLogs ?? []) as any[]).map((l) => ({
        id: `prop-${l.id}`,
        event: l.action as string,
        unit: null as string | null,
        ...describe(l.changes),
        actor: actorName(l.actor_id),
        notes: null as string | null,
        created_at: l.created_at as string,
      })),
      ...((addressLogs ?? []) as any[]).map((l) => ({
        id: `addr-${l.id}`,
        event: `address_${l.action}`,
        unit: null as string | null,
        ...describe(l.changes),
        actor: actorName(l.actor_id),
        notes: null as string | null,
        created_at: l.created_at as string,
      })),
      ...((unitLogs ?? []) as any[]).map((l) => ({
        id: `unit-${l.id}`,
        event: `unit_${l.action}`,
        unit: (unitLabel.get(l.unit_id) ?? null) as string | null,
        ...describe(l.changes),
        actor: actorName(l.actor_id),
        notes: null as string | null,
        created_at: l.created_at as string,
      })),
      ...((assignLogs ?? []) as any[])
        .filter(
          (l) =>
            (l.new_unit_id && unitLabel.has(l.new_unit_id)) ||
            (l.old_unit_id && unitLabel.has(l.old_unit_id)),
        )
        .map((l) => ({
          id: `assign-${l.id}`,
          event: `assignment_${l.action}`,
          unit: (unitLabel.get(l.new_unit_id ?? l.old_unit_id) ?? null) as string | null,
          previous: (l.old_unit_id ? (unitLabel.get(l.old_unit_id) ?? null) : null) as string | null,
          next: (l.new_unit_id ? (unitLabel.get(l.new_unit_id) ?? null) : null) as string | null,
          actor: actorName(l.actor_id),
          notes: null as string | null,
          created_at: l.created_at as string,
        })),
    ].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

    await logVendorAction(supabase as never, vendorId, "VENDOR_PROPERTY_VIEWED", {
      type: "property",
      id: data.id,
    });

    const occupied = unitRows.filter((u) => u.status === "occupied").length;

    return {
      property: {
        ...(property as any),
        zone_name: ((zone as any)?.zone_name ?? null) as string | null,
        unit_count: unitRows.length,
        occupied_units: occupied,
        available_units: unitRows.length - occupied,
        photo_url:
          signedPhotos.find((p) => p.is_primary)?.url ?? signedPhotos[0]?.url ?? null,
      },
      owner: owner
        ? {
            ...(owner as any),
            ...ownerStats,
            owner_type: ((property as any).owner_type ?? "landlord") as string,
          }
        : null,
      units: unitRows.map((u) => {
        const current = assignmentRows.find(
          (a) => a.unit_id === u.id && !a.end_date && a.role === "resident",
        );
        const owner = assignmentRows.find(
          (a) => a.unit_id === u.id && !a.end_date && a.role === "landlord",
        );
        return {
          id: u.id as string,
          unit_number: u.unit_number as string,
          unit_type: (u.unit_type ?? null) as string | null,
          floor: (u.floor ?? null) as string | null,
          building: (u.building ?? null) as string | null,
          bedrooms: (u.bedrooms ?? null) as number | null,
          status: (u.status ?? "vacant") as string,
          resident_id: (current?.user_id ?? null) as string | null,
          resident_name: (current ? (peopleMap.get(current.user_id)?.name ?? null) : null) as
            | string
            | null,
          owner_id: (owner?.user_id ?? null) as string | null,
          owner_name: (owner ? (peopleMap.get(owner.user_id)?.name ?? null) : null) as string | null,
          meters: meterRows
            .filter((m) => m.unit_id === u.id)
            .map((m) => ({
              id: m.id as string,
              meter_number: m.meter_number as string,
              type: m.type as string,
              status: m.status as string,
              installation_status: (m.installation_status ?? "not_installed") as string,
            })),
          created_at: u.created_at as string,
        };
      }),
      residents: assignmentRows
        .filter((a) => a.role === "resident")
        .map((a) => {
          const person = peopleMap.get(a.user_id);
          return {
            assignment_id: a.id as string,
            id: a.user_id as string,
            name: (person?.name ?? null) as string | null,
            email: (person?.email ?? null) as string | null,
            phone: (person?.phone ?? null) as string | null,
            profile_image: (person?.profile_image ?? null) as string | null,
            status: (person?.status ?? "active") as string,
            unit_number: (unitLabel.get(a.unit_id) ?? null) as string | null,
            start_date: (a.start_date ?? null) as string | null,
            end_date: (a.end_date ?? null) as string | null,
            current: !a.end_date,
          };
        }),
      photos: signedPhotos,
      timeline,
    };
  });

const propertyFields = {
  name: z.string().trim().min(2, { message: "Property name is required" }).max(140),
  code: text(40),
  description: text(2000),
  property_type: z.enum(["building", "zone"]),
  building_category: z.enum(["residential", "commercial"]).nullable().optional(),
  subtype: text(60),
  owner_type: z.enum(["landlord", "agent", "vendor"]),
  landlord_id: uuid.nullable().optional(),
  zone_id: z.number().int().positive().nullable().optional(),
  number_of_units: z.number().int().min(0).max(100000).nullable().optional(),
  status: z.enum(["active", "archived"]).optional(),
  country: text(120),
  state: text(120),
  city: text(120),
  estate: text(140),
  address_line1: text(200),
  address_line2: text(200),
  building_number: text(60),
  postal_code: text(30),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
};

export const createVendorProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object(propertyFields).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const vendorId = await assertVendor(context as never);

    if (data.zone_id == null) throw new Error("Please choose a zone you are assigned to");
    await assertZoneInScope(supabase as never, vendorId, data.zone_id);
    await assertOwnerVisible(supabase as never, data.landlord_id ?? null);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin
      .from("properties")
      .insert({
        ...data,
        status: data.status ?? "active",
        created_by: userId,
        updated_by: userId,
      } as never)
      .select("id, name")
      .single();
    if (error) throw new Error(error.message);

    await logVendorAction(
      supabase as never,
      vendorId,
      "VENDOR_PROPERTY_CREATED",
      { type: "property", id: (created as any).id },
      { name: data.name, zone_id: data.zone_id },
    );

    return { id: (created as any).id as string };
  });

export const updateVendorProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: uuid, ...propertyFields }).partial({ name: true, property_type: true, owner_type: true }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const vendorId = await assertVendor(context as never);
    const existing = await assertPropertyInScope(supabase as never, data.id);

    const { id, ...patch } = data;
    if (patch.zone_id != null && patch.zone_id !== existing.zone_id) {
      await assertZoneInScope(supabase as never, vendorId, patch.zone_id);
    }
    if (patch.landlord_id && patch.landlord_id !== existing.landlord_id) {
      await assertOwnerVisible(supabase as never, patch.landlord_id);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("properties")
      .update({ ...patch, updated_by: userId } as never)
      .eq("id", id);
    if (error) throw new Error(error.message);

    const ownerChanged = patch.landlord_id && patch.landlord_id !== existing.landlord_id;
    await logVendorAction(
      supabase as never,
      vendorId,
      ownerChanged ? "VENDOR_PROPERTY_OWNER_CHANGED" : "VENDOR_PROPERTY_UPDATED",
      { type: "property", id },
      { fields: Object.keys(patch) },
    );

    return { ok: true };
  });

export const setVendorPropertyStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: uuid,
        status: z.enum(["active", "archived"]),
        reason: z.string().trim().max(500).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const vendorId = await assertVendor(context as never);
    const existing = await assertPropertyInScope(supabase as never, data.id);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: updated, error } = await supabaseAdmin
      .from("properties")
      .update({ status: data.status, updated_by: userId } as never)
      .eq("id", data.id)
      .select("name")
      .single();
    if (error) throw new Error(error.message);

    await recordPropertyEvent(
      supabaseAdmin as never,
      data.id,
      (updated as any)?.name ?? null,
      userId,
      data.status === "active" ? "activated" : "deactivated",
      {
        status: { old: existing.status ?? null, new: data.status },
        ...(data.reason ? { reason: { old: null, new: data.reason } } : {}),
      },
    );
    await logVendorAction(
      supabase as never,
      vendorId,
      data.status === "active" ? "VENDOR_PROPERTY_ACTIVATED" : "VENDOR_PROPERTY_DEACTIVATED",
      { type: "property", id: data.id },
      { reason: data.reason ?? null },
    );

    return { ok: true };
  });

/** Archives a property. Records are always kept — nothing is hard-deleted. */
export const deleteVendorProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: uuid, reason: z.string().trim().max(500).optional() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const vendorId = await assertVendor(context as never);
    await assertPropertyInScope(supabase as never, data.id);

    const { data: units } = await supabase.from("units").select("id").eq("property_id", data.id);
    const unitIds = ((units ?? []) as any[]).map((u) => u.id as string);

    if (unitIds.length) {
      const { data: live } = await supabase
        .from("unit_assignments")
        .select("id")
        .in("unit_id", unitIds)
        .is("end_date", null)
        .limit(1);
      if (((live ?? []) as any[]).length) {
        throw new Error(
          "This property still has people assigned to its units. End those assignments first.",
        );
      }
      const { data: activeMeters } = await supabase
        .from("meters")
        .select("id")
        .in("unit_id", unitIds)
        .eq("status", "active")
        .limit(1);
      if (((activeMeters ?? []) as any[]).length) {
        throw new Error("This property still has active meters. Deactivate them first.");
      }
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: updated, error } = await supabaseAdmin
      .from("properties")
      .update({ status: "archived", updated_by: userId } as never)
      .eq("id", data.id)
      .select("name")
      .single();
    if (error) throw new Error(error.message);

    await recordPropertyEvent(
      supabaseAdmin as never,
      data.id,
      (updated as any)?.name ?? null,
      userId,
      "archived",
      { reason: { old: null, new: data.reason ?? "Archived by vendor" } },
    );
    await logVendorAction(
      supabase as never,
      vendorId,
      "VENDOR_PROPERTY_ARCHIVED",
      { type: "property", id: data.id },
      { reason: data.reason ?? null },
    );

    return { ok: true };
  });

export const addVendorPropertyPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        property_id: uuid,
        storage_path: z.string().trim().min(3).max(500),
        caption: z.string().trim().max(200).optional(),
        category: z.string().trim().max(60).optional(),
        is_primary: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const vendorId = await assertVendor(context as never);
    await assertPropertyInScope(supabase as never, data.property_id);
    if (!data.storage_path.startsWith(`${data.property_id}/`)) throw new Error("Access denied");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.is_primary) {
      await supabaseAdmin
        .from("property_photos")
        .update({ is_primary: false } as never)
        .eq("property_id", data.property_id);
    }
    const { data: created, error } = await supabaseAdmin
      .from("property_photos")
      .insert({
        property_id: data.property_id,
        storage_path: data.storage_path,
        caption: data.caption ?? null,
        category: data.category ?? "other",
        is_primary: data.is_primary ?? false,
        uploaded_by: userId,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await logVendorAction(
      supabase as never,
      vendorId,
      "VENDOR_PROPERTY_PHOTO_ADDED",
      { type: "property", id: data.property_id },
      { photo_id: (created as any).id },
    );

    return { id: (created as any).id as string };
  });

export const updateVendorPropertyPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: uuid,
        property_id: uuid,
        caption: z.string().trim().max(200).nullable().optional(),
        category: z.string().trim().max(60).optional(),
        is_primary: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const vendorId = await assertVendor(context as never);
    await assertPropertyInScope(supabase as never, data.property_id);

    const { data: photo, error: readError } = await supabase
      .from("property_photos")
      .select("id, property_id")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!photo || (photo as any).property_id !== data.property_id) throw new Error("Access denied");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.is_primary) {
      await supabaseAdmin
        .from("property_photos")
        .update({ is_primary: false } as never)
        .eq("property_id", data.property_id);
    }
    const patch: Record<string, unknown> = {};
    if (data.caption !== undefined) patch["caption"] = data.caption;
    if (data.category !== undefined) patch["category"] = data.category;
    if (data.is_primary !== undefined) patch["is_primary"] = data.is_primary;

    const { error } = await supabaseAdmin
      .from("property_photos")
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await logVendorAction(
      supabase as never,
      vendorId,
      "VENDOR_PROPERTY_PHOTO_UPDATED",
      { type: "property", id: data.property_id },
      { photo_id: data.id, actor: userId },
    );

    return { ok: true };
  });

export const deleteVendorPropertyPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: uuid, property_id: uuid }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const vendorId = await assertVendor(context as never);
    await assertPropertyInScope(supabase as never, data.property_id);

    const { data: photo, error: readError } = await supabase
      .from("property_photos")
      .select("id, property_id, storage_path")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!photo || (photo as any).property_id !== data.property_id) throw new Error("Access denied");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.storage.from("property-photos").remove([(photo as any).storage_path]);
    const { error } = await supabaseAdmin.from("property_photos").delete().eq("id", data.id);
    if (error) throw new Error(error.message);

    await logVendorAction(
      supabase as never,
      vendorId,
      "VENDOR_PROPERTY_PHOTO_DELETED",
      { type: "property", id: data.property_id },
      { photo_id: data.id },
    );

    return { ok: true };
  });
