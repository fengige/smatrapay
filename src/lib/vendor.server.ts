/** Server-only helpers that resolve the authenticated vendor's data scope. */

export type VendorMeter = {
  id: string;
  meter_number: string;
  serial_number: string;
  type: string;
  status: string;
  installation_status: string;
  installation_date: string | null;
  installer: string | null;
  installation_location: string | null;
  installation_notes: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  vending_software_id: string | null;
  vending_software_name: string | null;
  unit_id: string | null;
  unit_label: string | null;
  property_id: string | null;
  property_name: string | null;
  zone_id: number | null;
  zone_name: string | null;
  resident_id: string | null;
  resident_name: string | null;
  price_per_unit: number;
  initial_reading: number;
  sgc: number | null;
  krn: number | null;
  ti: number | null;
  ea: number | null;
  ken: number | null;
  created_at: string;
  updated_at: string;
};

export type VendorZone = {
  zone_id: number;
  zone_name: string;
  description: string | null;
  status: string;
  region: string | null;
  city: string | null;
  meter_count: number;
  resident_count: number;
  created_at: string;
  updated_at: string;
};

export type VendorResident = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  profile_image: string | null;
  created_at: string;
  unit_id: string | null;
  unit_label: string | null;
  property_id: string | null;
  property_name: string | null;
  zone_id: number | null;
  zone_name: string | null;
  meter_id: string | null;
  meter_number: string | null;
  meter_type: string | null;
  meter_status: string | null;
  installation_status: string | null;
  assigned_at: string | null;
};

export type VendorScope = {
  vendorId: string;
  meters: VendorMeter[];
  zones: VendorZone[];
  residents: VendorResident[];
};

type Client = { from: (t: string) => any; rpc: (n: string, a?: any) => any };

export async function assertVendor(context: { supabase: Client; userId: string }) {
  const { data: isVendor } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "vendor",
  });
  if (!isVendor) throw new Error("Vendor access required");
  return context.userId;
}

function byId<T extends Record<string, any>>(rows: T[], key: string) {
  const map = new Map<any, T>();
  for (const row of rows) map.set(row[key], row);
  return map;
}

/** Loads every record the authenticated vendor is allowed to see, in one pass. */
export async function loadVendorScope(
  supabase: Client,
  vendorId: string,
): Promise<VendorScope> {
  const { data: meterRows, error } = await supabase
    .from("meters")
    .select(
      "id, meter_number, serial_number, type, status, installation_status, installation_date, installer, installation_location, installation_notes, supplier_id, vending_software_id, unit_id, price_per_unit, initial_reading, sgc, krn, ti, ea, ken, created_at, updated_at",
    )
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const meterList = (meterRows ?? []) as any[];
  const unitIds = [...new Set(meterList.map((m) => m.unit_id).filter(Boolean))] as string[];
  const supplierIds = [...new Set(meterList.map((m) => m.supplier_id).filter(Boolean))] as string[];
  const vsIds = [...new Set(meterList.map((m) => m.vending_software_id).filter(Boolean))] as string[];

  const [unitsRes, suppliersRes, vsRes] = await Promise.all([
    unitIds.length
      ? supabase.from("units").select("id, unit_number, floor, property_id").in("id", unitIds)
      : Promise.resolve({ data: [] as any[] }),
    supplierIds.length
      ? supabase.from("meter_suppliers").select("id, company_name").in("id", supplierIds)
      : Promise.resolve({ data: [] as any[] }),
    vsIds.length
      ? supabase.from("vending_software").select("vending_software_id, name").in("vending_software_id", vsIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const units = (unitsRes.data ?? []) as any[];
  const suppliers = byId((suppliersRes.data ?? []) as any[], "id");
  const vendingSoftware = byId((vsRes.data ?? []) as any[], "vending_software_id");
  const propertyIds = [...new Set(units.map((u) => u.property_id).filter(Boolean))] as string[];

  const [propsRes, assignRes] = await Promise.all([
    propertyIds.length
      ? supabase
          .from("properties")
          .select("id, name, city, state, zone_id")
          .in("id", propertyIds)
      : Promise.resolve({ data: [] as any[] }),
    unitIds.length
      ? supabase
          .from("unit_assignments")
          .select("id, unit_id, user_id, role, start_date, end_date")
          .in("unit_id", unitIds)
          .eq("role", "resident")
          .order("start_date", { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const properties = (propsRes.data ?? []) as any[];
  const assignments = ((assignRes.data ?? []) as any[]).filter((a) => !a.end_date);
  const zoneIds = [...new Set(properties.map((p) => p.zone_id).filter((z) => z != null))] as number[];
  const residentIds = [...new Set(assignments.map((a) => a.user_id))] as string[];

  const [zonesRes, usersRes] = await Promise.all([
    zoneIds.length
      ? supabase
          .from("zones")
          .select("zone_id, zone_name, description, status, created_at, updated_at")
          .in("zone_id", zoneIds)
      : Promise.resolve({ data: [] as any[] }),
    residentIds.length
      ? supabase
          .from("users")
          .select("id, name, email, phone, status, profile_image, created_at")
          .in("id", residentIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const unitMap = byId(units, "id");
  const propertyMap = byId(properties, "id");
  const zoneMap = byId((zonesRes.data ?? []) as any[], "zone_id");
  const userMap = byId((usersRes.data ?? []) as any[], "id");

  const residentByUnit = new Map<string, any>();
  for (const a of assignments) if (!residentByUnit.has(a.unit_id)) residentByUnit.set(a.unit_id, a);

  const meters: VendorMeter[] = meterList.map((m) => {
    const unit = m.unit_id ? unitMap.get(m.unit_id) : undefined;
    const property = unit?.property_id ? propertyMap.get(unit.property_id) : undefined;
    const zone = property?.zone_id != null ? zoneMap.get(property.zone_id) : undefined;
    const assignment = m.unit_id ? residentByUnit.get(m.unit_id) : undefined;
    const resident = assignment ? userMap.get(assignment.user_id) : undefined;
    return {
      id: m.id,
      meter_number: m.meter_number,
      serial_number: m.serial_number,
      type: m.type,
      status: m.status,
      installation_status: m.installation_status ?? "not_installed",
      installation_date: m.installation_date ?? null,
      installer: m.installer ?? null,
      installation_location: m.installation_location ?? null,
      installation_notes: m.installation_notes ?? null,
      supplier_id: m.supplier_id ?? null,
      supplier_name: m.supplier_id ? (suppliers.get(m.supplier_id)?.company_name ?? null) : null,
      vending_software_id: m.vending_software_id ?? null,
      vending_software_name: m.vending_software_id
        ? (vendingSoftware.get(m.vending_software_id)?.name ?? null)
        : null,
      unit_id: m.unit_id ?? null,
      unit_label: unit ? `Unit ${unit.unit_number}` : null,
      property_id: property?.id ?? null,
      property_name: property?.name ?? null,
      zone_id: zone?.zone_id ?? null,
      zone_name: zone?.zone_name ?? null,
      resident_id: resident?.id ?? null,
      resident_name: resident?.name ?? resident?.email ?? null,
      price_per_unit: Number(m.price_per_unit ?? 0),
      initial_reading: Number(m.initial_reading ?? 0),
      sgc: m.sgc ?? null,
      krn: m.krn ?? null,
      ti: m.ti ?? null,
      ea: m.ea ?? null,
      ken: m.ken ?? null,
      created_at: m.created_at,
      updated_at: m.updated_at,
    };
  });

  const zones: VendorZone[] = [...zoneMap.values()].map((z: any) => {
    const zoneMeters = meters.filter((m) => m.zone_id === z.zone_id);
    const zoneProperty = properties.find((p) => p.zone_id === z.zone_id);
    return {
      zone_id: z.zone_id,
      zone_name: z.zone_name,
      description: z.description ?? null,
      status: z.status ?? "Active",
      region: zoneProperty?.state ?? null,
      city: zoneProperty?.city ?? null,
      meter_count: zoneMeters.length,
      resident_count: new Set(zoneMeters.map((m) => m.resident_id).filter(Boolean)).size,
      created_at: z.created_at,
      updated_at: z.updated_at,
    };
  });
  zones.sort((a, b) => a.zone_name.localeCompare(b.zone_name));

  const residents: VendorResident[] = [];
  for (const assignment of assignments) {
    const user = userMap.get(assignment.user_id);
    if (!user) continue;
    const unit = unitMap.get(assignment.unit_id);
    const property = unit?.property_id ? propertyMap.get(unit.property_id) : undefined;
    const zone = property?.zone_id != null ? zoneMap.get(property.zone_id) : undefined;
    const meter = meters.find((m) => m.unit_id === assignment.unit_id);
    if (residents.some((r) => r.id === user.id && r.unit_id === assignment.unit_id)) continue;
    residents.push({
      id: user.id,
      name: user.name ?? null,
      email: user.email ?? null,
      phone: user.phone ?? null,
      status: user.status ?? "active",
      profile_image: user.profile_image ?? null,
      created_at: user.created_at,
      unit_id: assignment.unit_id,
      unit_label: unit ? `Unit ${unit.unit_number}` : null,
      property_id: property?.id ?? null,
      property_name: property?.name ?? null,
      zone_id: zone?.zone_id ?? null,
      zone_name: zone?.zone_name ?? null,
      meter_id: meter?.id ?? null,
      meter_number: meter?.meter_number ?? null,
      meter_type: meter?.type ?? null,
      meter_status: meter?.status ?? null,
      installation_status: meter?.installation_status ?? null,
      assigned_at: assignment.start_date ?? null,
    });
  }
  residents.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

  return { vendorId, meters, zones, residents };
}

/** Appends an immutable vendor audit entry. */
export async function logVendorAction(
  supabase: Client,
  vendorId: string,
  action: string,
  resource: { type?: string; id?: string } = {},
  metadata: Record<string, unknown> = {},
) {
  await supabase.from("vendor_audit_logs").insert({
    vendor_id: vendorId,
    actor_id: vendorId,
    action,
    resource_type: resource.type ?? null,
    resource_id: resource.id ?? null,
    metadata,
  });
}

/** Creates an in-app notification for a recipient. */
export async function notify(
  supabase: Client,
  userId: string,
  type: string,
  title: string,
  message: string,
  resource: { type?: string; id?: string } = {},
  metadata: Record<string, unknown> = {},
) {
  await supabase.from("notifications").insert({
    user_id: userId,
    type,
    title,
    message,
    resource_type: resource.type ?? null,
    resource_id: resource.id ?? null,
    metadata,
  });
}
