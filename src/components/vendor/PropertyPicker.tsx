import { Button } from "@/components/ui/button";

/** Picks complete, authorized property records independently of units. */
export function PropertyPicker({ properties, value, onChange, loading, error }: {
  properties: { id: string; name: string }[]; value: string[]; onChange: (ids: string[]) => void;
  loading?: boolean; error?: Error | null;
}) {
  const props = [...new Map(properties.map((p) => [p.id, p.name]))]
    .sort((a, b) => a[1].localeCompare(b[1]));
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  const all = props.length > 0 && props.every(([id]) => value.includes(id));
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">Properties<span className="ml-0.5 text-destructive">*</span></span>
        {props.length > 0 && (
          <Button type="button" variant="ghost" size="sm" className="text-xs font-medium text-primary" disabled={loading || Boolean(error)} onClick={() => onChange(all ? [] : props.map(([id]) => id))}>
            {all ? "Clear all" : "Select all"}
          </Button>
        )}
      </div>
      <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border bg-background p-2">
        {props.map(([id, name]) => (
          <label key={id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent/10">
            <input type="checkbox" checked={value.includes(id)} onChange={() => toggle(id)} className="size-4 accent-primary" />
            {name}
          </label>
        ))}
        {loading ? <p className="px-2 py-1.5 text-xs text-muted-foreground">Loading properties…</p>
          : error ? <p role="alert" className="px-2 py-1.5 text-xs text-destructive">Could not load properties. Close and reopen to retry.</p>
          : props.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">No properties available.</p>}
      </div>
      <p className="text-xs text-muted-foreground">{value.length} selected</p>
    </div>
  );
}
