import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardList, Loader2, RefreshCw, Search } from "lucide-react";

import { listPropertyAuditLogs } from "@/lib/properties.functions";

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  code: "Code",
  status: "Status",
  property_type: "Property type",
  building_category: "Category",
  subtype: "Subtype",
  number_of_units: "Number of units",
  landlord_id: "Landlord",
  zone_id: "Zone",
  route_id: "Route",
  street_id: "Street",
  address_line1: "Address line 1",
  address_line2: "Address line 2",
  city: "City",
  state: "State / County",
  country: "Country",
  postal_code: "Postal code",
  description: "Description",
};

const ACTION_TONE: Record<string, string> = {
  created: "bg-emerald-500/10 text-emerald-600",
  updated: "bg-amber-500/10 text-amber-600",
  deleted: "bg-destructive/10 text-destructive",
};

function fmt(value: string) {
  return new Date(value).toLocaleString();
}

export function PropertyAuditViewer({ propertyId }: { propertyId: string }) {
  const fetchLogs = useServerFn(listPropertyAuditLogs);
  const [term, setTerm] = useState("");
  const [action, setAction] = useState("all");

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["property-audit", propertyId],
    queryFn: () => fetchLogs({ data: { propertyId } }),
  });

  const logs = useMemo(() => data?.logs ?? [], [data]);

  const filtered = useMemo(() => {
    const q = term.trim().toLowerCase();
    return logs.filter((log) => {
      if (action !== "all" && log.action !== action) return false;
      if (!q) return true;
      const fields = Object.keys(log.changes)
        .map((k) => FIELD_LABELS[k] ?? k)
        .join(" ");
      return `${log.actor} ${log.action} ${fields}`.toLowerCase().includes(q);
    });
  }, [logs, term, action]);

  return (
    <section className="rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ClipboardList className="size-4 text-primary" /> Property change history
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex items-stretch overflow-hidden rounded-lg border border-border focus-within:border-primary">
            <span className="flex items-center bg-muted/50 px-3 text-muted-foreground">
              <Search className="size-4" />
            </span>
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search by actor or field"
              aria-label="Search property change history"
              className="bg-background px-3 py-2 text-sm outline-none"
            />
          </div>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            aria-label="Filter by action"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          >
            <option value="all">All actions</option>
            <option value="created">Created</option>
            <option value="updated">Updated</option>
            <option value="deleted">Deleted</option>
          </select>
          <button
            type="button"
            onClick={() => refetch()}
            aria-label="Refresh change history"
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent/10"
          >
            <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="divide-y divide-border">
        {isLoading && (
          <p className="p-6 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto size-5 animate-spin" />
          </p>
        )}
        {!isLoading && error && (
          <p className="p-6 text-center text-sm text-destructive">{(error as Error).message}</p>
        )}
        {!isLoading && !error && !filtered.length && (
          <p className="p-6 text-center text-sm text-muted-foreground">
            No property changes recorded yet.
          </p>
        )}
        {filtered.map((log) => (
          <div key={log.id} className="p-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${
                  ACTION_TONE[log.action] ?? "bg-muted text-muted-foreground"
                }`}
              >
                {log.action}
              </span>
              <span className="font-semibold text-foreground">{log.actor}</span>
              <span className="text-xs text-muted-foreground">{fmt(log.created_at)}</span>
            </div>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {Object.entries(log.changes).map(([field, change]) => (
                <li key={field}>
                  <span className="font-medium text-foreground">
                    {FIELD_LABELS[field] ?? field}:
                  </span>{" "}
                  <span className="line-through opacity-70">{change.old ?? "—"}</span> →{" "}
                  <span className="text-foreground">{change.new ?? "—"}</span>
                </li>
              ))}
              {!Object.keys(log.changes).length && <li>No field-level detail recorded.</li>}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
