type AssignedMeter = {
  unit_id: string | null;
  meter_number: string;
  type: string;
};

/** Display current assignments, never the unit's legacy meter-number fields. */
export function withAssignedMeterNumbers<T extends { id: string }>(
  units: readonly T[],
  meters: readonly AssignedMeter[],
) {
  const byUnit = new Map<string, Record<string, Set<string>>>();
  for (const meter of meters) {
    if (!meter.unit_id) continue;
    const type = meter.type.trim().toLowerCase();
    if (!["electricity", "water", "gas"].includes(type)) continue;
    const groups = byUnit.get(meter.unit_id) ?? {};
    const numbers = groups[type] ?? new Set<string>();
    numbers.add(meter.meter_number);
    groups[type] = numbers;
    byUnit.set(meter.unit_id, groups);
  }
  return units.map((unit) => {
    const groups = byUnit.get(unit.id);
    const numberFor = (type: string) => {
      const numbers = groups?.[type];
      return numbers?.size
        ? [...numbers].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).join(", ")
        : null;
    };
    return {
      ...unit,
      electricity_meter_no: numberFor("electricity"),
      water_meter_no: numberFor("water"),
      gas_meter_no: numberFor("gas"),
    };
  });
}