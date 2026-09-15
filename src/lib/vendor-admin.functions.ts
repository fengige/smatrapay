import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { applyPriceMode, type PriceMode } from "@/lib/prices.functions";

const uuid = z.string().uuid();

export type VendorOwnerRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  owner_type: string;
  property_count: number;
  unit_count: number;
  meter_count: number;
  created_at: string | null;
};

export type VendorPropertyRow = {
  id: string;
  name: string;
  code: string | null;
  property_type: string | null;
  city: string | null;
  state: string | null;
  status: string;
  zone_id: number | null;
  zone_name: string | null;
  owner_type: string;
  owner_id: string | null;
  owner_name: string | null;
  unit_count: number;
  meter_count: number;
  resident_count: number;
  created_at: string;
};

export type VendorServiceProviderRow = {
  id: string;
  name: string;
  phone: string | null;
  role: string;
  status: string;
  team_id: string;
  team_name: string;
  open_requests: number;
  completed_requests: number;
  created_at: string;
};

export type VendorSupplierRow = {
  id: string;
  company_name: string;
  utility_type: string;
  license_number: string | null;
  contact_name: string | null;
  email: string | null;
  phone_number: string | null;
  website_url: string | null;
  status: string;
  logo_url: string | null;
  meter_count: number;
  active_meters: number;
};

export type VendorDirectory = {
  owners: VendorOwnerRow[];
  properties: VendorPropertyRow[];
  serviceProviders: VendorServiceProviderRow[];
  suppliers: VendorSupplierRow[];
};

/** Landlords, properties, service providers and suppliers within the vendor's own scope. */
export const getVendorDirectory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<VendorDirectory> => {
    const { assertVendor } = await import("@/lib/vendor.server");
    const vendorId = await assertVendor(context as never);
    const supabase = context.supabase as any;

    const { data: meterRows, error } = await supabase
      .from("meters")
      .select("id, unit_id, supplier_id, status")
      .eq("vendor_id", vendorId);
    if (error) throw new Error(error.message);
    const meters = (meterRows ?? []) as any[];

    const unitIds = [...new Set(meters.map((m) => m.unit_id).filter(Boolean))] as string[];
    const supplierIds = [...new Set(meters.map((m) => m.supplier_id).filter(Boolean))] as string[];

    const [unitsRes, suppliersRes, teamsRes] = await Promise.all([
      unitIds.length
        ? supabase.from("units").select("id, property_id").in("id", unitIds)
        : Promise.resolve({ data: [] }),
      supplierIds.length
        ? supabase
            .from("meter_suppliers")
            .select(
              "id, company_name, utility_type, license_number, contact_name, email, phone_number, website_url, status, logo_url",
            )
            .in("id", supplierIds)
        : Promise.resolve({ data: [] }),
      supabase.from("installation_teams").select("id, name").eq("vendor_id", vendorId),
    ]);

    const units = (unitsRes.data ?? []) as any[];
    const unitProperty = new Map(units.map((u) => [u.id as string, u.property_id as string]));
    const propertyIds = [...new Set(units.map((u) => u.property_id).filter(Boolean))] as string[];

    const [propsRes, assignRes] = await Promise.all([
      propertyIds.length
        ? supabase
            .from("properties")
            .select(
              "id, name, code, property_type, city, state, status, zone_id, landlord_id, owner_type, created_at",
            )
            .in("id", propertyIds)
        : Promise.resolve({ data: [] }),
      unitIds.length
        ? supabase
            .from("unit_assignments")
            .select("unit_id, user_id, end_date")
            .in("unit_id", unitIds)
            .eq("role", "resident")
        : Promise.resolve({ data: [] }),
    ]);

    const properties = (propsRes.data ?? []) as any[];
    const assignments = ((assignRes.data ?? []) as any[]).filter((a) => !a.end_date);

    const zoneIds = [...new Set(properties.map((p) => p.zone_id).filter((z: any) => z != null))] as number[];
    const ownerIds = [...new Set(properties.map((p) => p.landlord_id).filter(Boolean))] as string[];

    const [zonesRes, ownersRes] = await Promise.all([
      zoneIds.length
        ? supabase.from("zones").select("zone_id, zone_name").in("zone_id", zoneIds)
        : Promise.resolve({ data: [] }),
      ownerIds.length
        ? supabase
            .from("users")
            .select("id, name, email, phone, status, created_at")
            .in("id", ownerIds)
        : Promise.resolve({ data: [] }),
    ]);

    const zoneName = new Map(
      ((zonesRes.data ?? []) as any[]).map((z) => [z.zone_id as number, z.zone_name as string]),
    );
    const ownerById = new Map(((ownersRes.data ?? []) as any[]).map((u) => [u.id as string, u]));

    // Per-property tallies derived from the vendor's own meters/units only.
    const propUnits = new Map<string, Set<string>>();
    const propMeters = new Map<string, number>();
    for (const m of meters) {
      const pid = m.unit_id ? unitProperty.get(m.unit_id) : undefined;
      if (!pid) continue;
      propMeters.set(pid, (propMeters.get(pid) ?? 0) + 1);
      const set = propUnits.get(pid) ?? new Set<string>();
      set.add(m.unit_id);
      propUnits.set(pid, set);
    }
    const propResidents = new Map<string, Set<string>>();
    for (const a of assignments) {
      const pid = unitProperty.get(a.unit_id);
      if (!pid) continue;
      const set = propResidents.get(pid) ?? new Set<string>();
      set.add(a.user_id);
      propResidents.set(pid, set);
    }

    const propertyRows: VendorPropertyRow[] = properties
      .map((p) => {
        const owner = p.landlord_id ? ownerById.get(p.landlord_id) : undefined;
        return {
          id: p.id,
          name: p.name,
          code: p.code ?? null,
          property_type: p.property_type ?? null,
          city: p.city ?? null,
          state: p.state ?? null,
          status: p.status ?? "active",
          zone_id: p.zone_id ?? null,
          zone_name: p.zone_id != null ? (zoneName.get(p.zone_id) ?? null) : null,
          owner_type: p.owner_type ?? "landlord",
          owner_id: p.landlord_id ?? null,
          owner_name: owner ? (owner.name ?? owner.email ?? null) : null,
          unit_count: propUnits.get(p.id)?.size ?? 0,
          meter_count: propMeters.get(p.id) ?? 0,
          resident_count: propResidents.get(p.id)?.size ?? 0,
          created_at: p.created_at,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const owners: VendorOwnerRow[] = [];
    for (const [id, user] of ownerById) {
      const owned = propertyRows.filter((p) => p.owner_id === id);
      if (!owned.length) continue;
      owners.push({
        id,
        name: user.name ?? null,
        email: user.email ?? null,
        phone: user.phone ?? null,
        status: user.status ?? "active",
        owner_type: owned[0]!.owner_type,
        property_count: owned.length,
        unit_count: owned.reduce((s, p) => s + p.unit_count, 0),
        meter_count: owned.reduce((s, p) => s + p.meter_count, 0),
        created_at: user.created_at ?? null,
      });
    }
    owners.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

    const supplierRows: VendorSupplierRow[] = ((suppliersRes.data ?? []) as any[])
      .map((s) => {
        const own = meters.filter((m) => m.supplier_id === s.id);
        return {
          id: s.id,
          company_name: s.company_name,
          utility_type: s.utility_type,
          license_number: s.license_number ?? null,
          contact_name: s.contact_name ?? null,
          email: s.email ?? null,
          phone_number: s.phone_number ?? null,
          website_url: s.website_url ?? null,
          status: s.status,
          logo_url: s.logo_url ?? null,
          meter_count: own.length,
          active_meters: own.filter((m) => m.status === "active").length,
        };
      })
      .sort((a, b) => a.company_name.localeCompare(b.company_name));

    const teams = (teamsRes.data ?? []) as any[];
    const teamName = new Map(teams.map((t) => [t.id as string, t.name as string]));
    let serviceProviders: VendorServiceProviderRow[] = [];
    if (teams.length) {
      const [membersRes, requestsRes] = await Promise.all([
        supabase
          .from("installation_team_members")
          .select("id, team_id, name, phone, role, status, created_at")
          .eq("vendor_id", vendorId),
        supabase.from("service_requests").select("technician_id, status").eq("vendor_id", vendorId),
      ]);
      const requests = (requestsRes.data ?? []) as any[];
      serviceProviders = ((membersRes.data ?? []) as any[])
        .map((m) => {
          const mine = requests.filter((r) => r.technician_id === m.id);
          return {
            id: m.id,
            name: m.name,
            phone: m.phone ?? null,
            role: m.role,
            status: m.status,
            team_id: m.team_id,
            team_name: teamName.get(m.team_id) ?? "—",
            open_requests: mine.filter((r) => !["resolved", "closed", "cancelled"].includes(r.status))
              .length,
            completed_requests: mine.filter((r) => ["resolved", "closed"].includes(r.status)).length,
            created_at: m.created_at,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    return { owners, properties: propertyRows, serviceProviders, suppliers: supplierRows };
  });

const priceInput = z.object({
  ids: z.array(uuid).min(1, "Select at least one meter").max(1000),
  mode: z.enum(["set", "increase_pct", "decrease_pct", "increase_amount", "decrease_amount"]),
  value: z.number().finite().min(0).max(1_000_000),
  note: z.string().trim().max(500).optional().nullable(),
});

export type VendorPriceResult = {
  submitted: number;
  unchanged: number;
  changes: { id: string; meter_number: string; from: number; to: number }[];
};

export type VendorPriceRequestRow = {
  id: string;
  created_at: string;
  reviewed_at: string | null;
  meter_id: string;
  meter_number: string;
  current_price: number;
  requested_price: number;
  status: string;
  note: string | null;
  review_note: string | null;
};

/**
 * Vendors propose price-per-unit changes on their own meters. Nothing changes
 * on the meter until an admin approves the request in Price Management.
 */
export const setVendorMeterPrices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => priceInput.parse(d))
  .handler(async ({ data, context }): Promise<VendorPriceResult> => {
    const { assertVendor, logVendorAction } = await import("@/lib/vendor.server");
    const vendorId = await assertVendor(context as never);
    const supabase = context.supabase as any;

    const { data: rows, error } = await supabase
      .from("meters")
      .select("id, meter_number, price_per_unit")
      .eq("vendor_id", vendorId)
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as any[];
    if (list.length !== data.ids.length) throw new Error("Access denied");

    const changes: VendorPriceResult["changes"] = [];
    let unchanged = 0;
    for (const row of list) {
      const from = Number(row.price_per_unit ?? 0);
      const to = applyPriceMode(from, data.mode as PriceMode, data.value);
      if (to < 0) throw new Error(`Meter ${row.meter_number} would get a negative price`);
      if (to === from) {
        unchanged += 1;
        continue;
      }
      changes.push({ id: row.id, meter_number: row.meter_number ?? "", from, to });
    }

    if (changes.length) {
      // Supersede any still-pending request for the same meters.
      const { error: supErr } = await supabase
        .from("meter_price_change_requests")
        .update({ status: "rejected", review_note: "Superseded by a newer request" })
        .eq("vendor_id", vendorId)
        .eq("status", "pending")
        .in("meter_id", changes.map((c) => c.id));
      if (supErr) throw new Error(supErr.message);

      const { error: insErr } = await supabase.from("meter_price_change_requests").insert(
        changes.map((c) => ({
          meter_id: c.id,
          vendor_id: vendorId,
          current_price: c.from,
          requested_price: c.to,
          mode: data.mode,
          value: data.value,
          status: "pending",
          requested_by: vendorId,
          ...(data.note ? { note: data.note } : {}),
        })),
      );
      if (insErr) throw new Error(insErr.message);

      await logVendorAction(supabase, vendorId, "VENDOR_METER_PRICE_REQUESTED", { type: "meter" }, {
        count: changes.length,
        mode: data.mode,
        value: data.value,
      });
    }

    return { submitted: changes.length, unchanged, changes };
  });

/** The signed-in vendor's own price change requests. */
export const listVendorPriceRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<VendorPriceRequestRow[]> => {
    const { assertVendor } = await import("@/lib/vendor.server");
    const vendorId = await assertVendor(context as never);
    const supabase = context.supabase as any;

    const { data: rows, error } = await supabase
      .from("meter_price_change_requests")
      .select("id, created_at, reviewed_at, meter_id, current_price, requested_price, status, note, review_note")
      .eq("vendor_id", vendorId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as any[];

    const meterIds = [...new Set(list.map((r) => r.meter_id))];
    let meters: any[] = [];
    if (meterIds.length) {
      const { data: m } = await supabase.from("meters").select("id, meter_number").in("id", meterIds);
      meters = m ?? [];
    }
    const byId = new Map(meters.map((m) => [m.id as string, m.meter_number as string]));

    return list.map((r) => ({
      id: r.id,
      created_at: r.created_at,
      reviewed_at: r.reviewed_at ?? null,
      meter_id: r.meter_id,
      meter_number: byId.get(r.meter_id) ?? "—",
      current_price: Number(r.current_price ?? 0),
      requested_price: Number(r.requested_price ?? 0),
      status: r.status,
      note: r.note ?? null,
      review_note: r.review_note ?? null,
    }));
  });
