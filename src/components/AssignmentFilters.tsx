import { METER_TYPE_OPTIONS, type AssignmentFilter } from "@/lib/assignment-filters";

const cls = "rounded-full border border-border bg-card px-4 py-2 text-sm";

export function AssignmentFilters({
  value,
  onChange,
  properties,
}: {
  value: AssignmentFilter;
  onChange: (next: AssignmentFilter) => void;
  properties: { id: string; name: string }[];
}) {
  return (
    <>
      <select
        aria-label="Filter by property"
        value={value.propertyMode}
        onChange={(e) =>
          onChange({ ...value, propertyMode: e.target.value as AssignmentFilter["propertyMode"], propertyId: "" })
        }
        className={cls}
      >
        <option value="all">All Properties</option>
        <option value="specific">Specific Property</option>
      </select>
      {value.propertyMode === "specific" && (
        <select
          aria-label="Select property"
          value={value.propertyId}
          onChange={(e) => onChange({ ...value, propertyId: e.target.value })}
          className={cls}
          disabled={properties.length === 0}
        >
          <option value="">{properties.length ? "Choose a property" : "No properties available"}</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}
      <select
        aria-label="Filter by meter type"
        value={value.meterType}
        onChange={(e) => onChange({ ...value, meterType: e.target.value })}
        className={cls}
      >
        <option value="all">All Meter Types</option>
        {METER_TYPE_OPTIONS.map((t) => (
          <option key={t} value={t}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </option>
        ))}
      </select>
    </>
  );
}
