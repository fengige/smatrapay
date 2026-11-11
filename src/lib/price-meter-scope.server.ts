import { readAll } from "./landlord-scope.server";

export type PriceMeter = {
  id: string; meter_number: string; serial_number: string; type: string;
  status: string; price_per_unit: number; unit_label: string | null;
  property_id: string | null; property_name: string | null; zone_name: string | null; resident_name: string | null;
  unit_name: string | null;
  landlord_name: string | null;
  owner_commission: { commission_payer: "owner" | "resident"; commission_percentage: number; vat_on_commission_percentage: number } | null;
};

async function related(db: any, table: string, columns: string, ids: string[]) {
  const result: any[] = [];
  const unique = [...new Set(ids.filter(Boolean))];
  for (let start = 0; start < unique.length; start += 200) {
    result.push(...await readAll(() => db.from(table).select(columns)
      .in("id", unique.slice(start, start + 200)).order("id")));
  }
  return result;
}

/** Caller-bound reads: the total and list always use the same complete meter set. */
export async function readPriceMeters(db: any, portal: "vendor" | "landlord", userId: string): Promise<PriceMeter[]> {
  const { data: allowed, error } = await db.rpc("has_role", { _user_id: userId, _role: portal });
  if (error || !allowed) throw new Error(`${portal === "vendor" ? "Vendor" : "Landlord"} access required`);
  const columns = "id,meter_number,serial_number,type,status,price_per_unit,unit_id,landlord_id";
  let meters: any[] = [];
  if (portal === "vendor") {
    meters = await readAll(() => db.from("meters").select(columns).eq("vendor_id", userId).order("id"));
  } else {
    const { data: ids, error: idsError } = await db.rpc("landlord_meter_ids");
    if (idsError) throw new Error(idsError.message);
    meters = await related(db, "meters", columns, (ids ?? []) as string[]);
  }
  meters = [...new Map(meters.map(m => [m.id, m])).values()];
  const units = await related(db, "units", "id,unit_number,property_id", meters.map(m => m.unit_id));
  const properties = await related(db, "properties", "id,name,zone_id,landlord_id,owner_type", units.map(u => u.property_id));
  const assignments: any[] = [];
  for (let start = 0; start < units.length; start += 200) {
    assignments.push(...await readAll(() => db.from("unit_assignments")
      .select("id,unit_id,user_id").in("unit_id", units.slice(start, start + 200).map(u => u.id))
      .eq("role", "resident").is("end_date", null).order("start_date", { ascending: false }).order("id")));
  }
  const propLandlords: any[] = [];
  if (portal === "vendor") {
    for (let start = 0; start < properties.length; start += 200) {
      propLandlords.push(...await readAll(() => db.from("property_landlords").select("id,property_id,landlord_id")
        .in("property_id", properties.slice(start, start + 200).map(p => p.id)).order("id")));
    }
  }
  const landlordIdsFor = (m: any, property: any): string[] => [...new Set([
    m.landlord_id,
    property && (property.owner_type ?? "landlord") === "landlord" ? property.landlord_id : null,
    ...propLandlords.filter(l => l.property_id === property?.id).map(l => l.landlord_id),
  ].filter(Boolean) as string[])];
  const users = await related(db, "users", "id,name,email", [
    ...assignments.map(a => a.user_id), ...meters.flatMap(m => m.landlord_id ? [m.landlord_id] : []),
    ...properties.map(p => p.landlord_id), ...propLandlords.map(l => l.landlord_id)]);
  const zoneIds = [...new Set(properties.map(p => p.zone_id).filter(id => id != null))];
  const zones: any[] = [];
  for (let start = 0; start < zoneIds.length; start += 200) {
    zones.push(...await readAll(() => db.from("zones").select("zone_id,zone_name")
      .in("zone_id", zoneIds.slice(start, start + 200)).order("zone_id")));
  }
  const unitMap = new Map(units.map(u => [u.id, u]));
  const propertyMap = new Map(properties.map(p => [p.id, p]));
  const userMap = new Map(users.map(u => [u.id, u]));
  const zoneMap = new Map(zones.map(z => [z.zone_id, z.zone_name]));
  // The RPC derives both owner and property from session-owned meters; no caller-supplied owner IDs.
  const commissions = portal === "vendor"
    ? await readAll(() => db.rpc("vendor_price_commissions").order("meter_id"))
    : [];
  const commissionMap = new Map(commissions.map(c => [c.meter_id, c]));
  return meters.map(m => {
    const unit = unitMap.get(m.unit_id);
    const property = propertyMap.get(unit?.property_id);
    const assignment = assignments.find(a => a.unit_id === m.unit_id);
    const resident = userMap.get(assignment?.user_id);
    const commission = commissionMap.get(m.id);
    return { id: m.id, meter_number: m.meter_number, serial_number: m.serial_number,
      type: m.type, status: m.status, price_per_unit: Number(m.price_per_unit ?? 0),
      unit_label: unit ? `Unit ${unit.unit_number}` : null, property_id: property?.id ?? null, property_name: property?.name ?? null,
      unit_name: unit?.unit_number ?? null,
      landlord_name: landlordIdsFor(m, property).map(id => userMap.get(id)?.name ?? userMap.get(id)?.email).filter(Boolean).join(", ") || null,
      owner_commission: commission?.commission_payer ? {
        commission_payer: commission.commission_payer,
        commission_percentage: Number(commission.commission_percentage),
        vat_on_commission_percentage: Number(commission.vat_on_commission_percentage),
      } : null,
      zone_name: zoneMap.get(property?.zone_id) ?? null, resident_name: resident?.name ?? resident?.email ?? null };
  });
}