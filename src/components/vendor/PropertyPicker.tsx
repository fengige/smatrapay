import type { AssignableUnit } from "@/components/vendor/ResidentForms";

/** Picks one property from the vendor's in-scope units. */
export function PropertyPicker({ units, value, onChange }: {
  units: AssignableUnit[]; value: string; onChange: (id: string) => void;
}) {
  const props = [...new Map(units.filter((u) => u.property_id).map((u) => [u.property_id as string, u.property_name ?? "Unnamed property"]))]
    .sort((a, b) => a[1].localeCompare(b[1]));
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-muted-foreground">Property<span className="ml-0.5 text-destructive">*</span></span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary">
        <option value="">Select property</option>
        {props.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select>
      {props.length === 0 && <p className="text-xs text-muted-foreground">No properties available.</p>}
    </label>
  );
}
