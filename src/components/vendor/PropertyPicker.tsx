import type { AssignableUnit } from "@/components/vendor/ResidentForms";

/** Picks one or more properties from the vendor's in-scope units. */
export function PropertyPicker({ units, value, onChange }: {
  units: AssignableUnit[]; value: string[]; onChange: (ids: string[]) => void;
}) {
  const props = [...new Map(units.filter((u) => u.property_id).map((u) => [u.property_id as string, u.property_name ?? "Unnamed property"]))]
    .sort((a, b) => a[1].localeCompare(b[1]));
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  const all = props.length > 0 && value.length === props.length;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">Properties<span className="ml-0.5 text-destructive">*</span></span>
        {props.length > 0 && (
          <button type="button" className="text-xs font-medium text-primary" onClick={() => onChange(all ? [] : props.map(([id]) => id))}>
            {all ? "Clear all" : "Select all"}
          </button>
        )}
      </div>
      <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border bg-background p-2">
        {props.map(([id, name]) => (
          <label key={id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent/10">
            <input type="checkbox" checked={value.includes(id)} onChange={() => toggle(id)} className="size-4 accent-primary" />
            {name}
          </label>
        ))}
        {props.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">No properties available.</p>}
      </div>
      <p className="text-xs text-muted-foreground">{value.length} selected</p>
    </div>
  );
}
