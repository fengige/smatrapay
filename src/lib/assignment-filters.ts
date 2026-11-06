/** Property and meter-type filters shared by admin and vendor Meter Assignments. */
export const METER_TYPE_OPTIONS = ["electricity", "water", "gas"] as const;

export type AssignmentFilter = {
  propertyMode: "all" | "specific";
  propertyId: string;
  meterType: string; // "all" | electricity | water | gas
};

export const DEFAULT_ASSIGNMENT_FILTER: AssignmentFilter = {
  propertyMode: "all",
  propertyId: "",
  meterType: "all",
};

type FilterableMeter = { property_id: string | null; type?: string | null };

export function matchesAssignmentFilter(m: FilterableMeter, f: AssignmentFilter): boolean {
  if (f.propertyMode === "specific" && f.propertyId && m.property_id !== f.propertyId) return false;
  if (f.meterType !== "all" && String(m.type ?? "").toLowerCase() !== f.meterType) return false;
  return true;
}

/** Property options drawn only from records the server already scoped to the caller. */
export function scopedPropertyOptions(
  sources: { property_id: string | null; property_name: string | null }[],
): { id: string; name: string }[] {
  const map = new Map<string, string>();
  for (const s of sources) {
    if (s.property_id && !map.has(s.property_id)) map.set(s.property_id, s.property_name ?? "Unnamed property");
  }
  return [...map].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}
