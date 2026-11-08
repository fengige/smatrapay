import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { PortalLayout } from "@/components/PortalLayout";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorBlock, LoadingBlock, StatCard, StatusBadge, titleCase } from "@/components/vendor/VendorUI";
import { listPortalPriceMeters } from "@/lib/price-meter-scope.functions";
import { checkRoleAccess } from "@/lib/auth.functions";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { matchesPriceProperty, pricePropertyOptions } from "@/lib/price-management-data";

export const Route = createFileRoute("/_authenticated/landlord/price-management")({
  head: () => ({ meta: [
    { title: "Meter Prices · Landlord · SmatraPay" },
    { name: "description", content: "View prices and complete meter totals across your linked properties." },
    { property: "og:title", content: "Meter Prices · Landlord · SmatraPay" },
    { property: "og:description", content: "Landlord-scoped meter prices across linked properties and managing vendors." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  loader: async () => {
    const access = await checkRoleAccess({ data: { role: "landlord" } });
    if (!access.allowed) throw new Error("Landlord access required");
    return access;
  },
  component: LandlordPriceManagement,
});

function LandlordPriceManagement() {
  const fetchMeters = useServerFn(listPortalPriceMeters);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["landlord-price-meters"],
    queryFn: () => fetchMeters({ data: { portal: "landlord" } }),
    refetchInterval: 30_000,
  });
  useRealtimeRefresh("landlord-price-meters", ["meters", "units", "properties", "unit_assignments"], [["landlord-price-meters"]]);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [property, setProperty] = useState("all");
  const meters = data?.meters ?? [];
  const properties = pricePropertyOptions(meters);
  const rows = meters.filter(m => matchesPriceProperty(m, property) && (type === "all" || m.type.toLowerCase() === type) &&
    [m.meter_number, m.serial_number, m.unit_label, m.property_name, m.resident_name]
      .some(v => (v ?? "").toLowerCase().includes(search.trim().toLowerCase())));
  return <PortalLayout roles={["landlord"]} title="Price Management" actions={
    <Button variant="outline" disabled={isFetching} onClick={() => void refetch()}>
      <RefreshCw className={isFetching ? "animate-spin" : ""} /> Refresh
    </Button>
  }>
    {error ? <ErrorBlock message={error.message} /> : isLoading ? <LoadingBlock /> : <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard label="Meters" value={meters.length} />
        <StatCard label="Average price / unit" value={`KES ${(meters.length ? meters.reduce((sum, m) => sum + m.price_per_unit, 0) / meters.length : 0).toFixed(2)}`} />
      </div>
      <div className="flex flex-wrap gap-3">
        <input aria-label="Search meters" placeholder="Search meter, unit, property or resident" value={search} onChange={e => setSearch(e.target.value)} className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <select aria-label="Filter by meter type" value={type} onChange={e => setType(e.target.value)} className="rounded-md border border-border bg-background px-3 py-2 text-sm">
          <option value="all">All types</option><option value="electricity">Electricity</option><option value="water">Water</option><option value="gas">Gas</option>
        </select>
        <select aria-label="Filter by property" value={property} onChange={e => setProperty(e.target.value)} className="max-w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
          <option value="all">All properties</option>
          <option value="none">No property / unassigned</option>
          {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <p className="text-sm text-muted-foreground">{rows.length} of {meters.length} meters</p>
      {meters.length === 0 ? <EmptyState title="No meters" message="No meters are linked to your landlord account yet." /> :
        <div className="overflow-x-auto"><table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-muted-foreground"><tr>{["Meter", "Type", "Property", "Unit", "Resident", "Price / unit", "Status"].map(label => <th key={label} className="px-3 py-3">{label}</th>)}</tr></thead>
          <tbody>{rows.map(m => <tr key={m.id} className="border-t border-border">
            <td className="px-3 py-3 font-semibold">{m.meter_number}</td><td className="px-3 py-3">{titleCase(m.type)}</td>
            <td className="px-3 py-3">{m.property_name ?? "—"}</td><td className="px-3 py-3">{m.unit_label ?? "—"}</td><td className="px-3 py-3">{m.resident_name ?? "—"}</td>
            <td className="px-3 py-3">KES {m.price_per_unit.toFixed(2)}</td><td className="px-3 py-3"><StatusBadge value={m.status} /></td>
          </tr>)}{rows.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No meters match these filters.</td></tr>}</tbody>
        </table></div>}
    </div>}
  </PortalLayout>;
}