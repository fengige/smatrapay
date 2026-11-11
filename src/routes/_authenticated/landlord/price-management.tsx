import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ChevronDown, RefreshCw } from "lucide-react";
import { listLandlordPriceRequests, submitLandlordPriceRequests } from "@/lib/landlord-prices.functions";
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
  const qc = useQueryClient();
  const fetchRequests = useServerFn(listLandlordPriceRequests);
  const submitFn = useServerFn(submitLandlordPriceRequests);
  const requests = useQuery({ queryKey: ["landlord-price-requests"], queryFn: () => fetchRequests() });
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState("set");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  const submit = useMutation({
    mutationFn: () => submitFn({ data: { ids: selected, mode: mode as "set", value: Number(value), note: note.trim() || null } }),
    onSuccess: (r) => {
      toast.success(r.submitted ? `${r.submitted} price change request(s) sent for approval` : "No price changes to request");
      setSelected([]); setValue(""); setNote(""); setOpen(true);
      void qc.invalidateQueries({ queryKey: ["landlord-price-requests"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggle = (id: string) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
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
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h2 className="font-semibold">Request price change</h2>
        <p className="text-sm text-muted-foreground">{selected.length} meter(s) selected. Requests take effect after administrator approval.</p>
        <div className="flex flex-wrap gap-2">
          <select aria-label="Change type" value={mode} onChange={e => setMode(e.target.value)} className="rounded-md border border-border bg-background px-3 py-2 text-sm">
            <option value="set">Set price to (KES)</option><option value="increase_pct">Increase by %</option><option value="decrease_pct">Decrease by %</option>
            <option value="increase_amount">Increase by KES</option><option value="decrease_amount">Decrease by KES</option>
          </select>
          <input aria-label="Value" type="number" min={0} step="0.01" value={value} onChange={e => setValue(e.target.value)} placeholder="Value" className="w-32 rounded-md border border-border bg-background px-3 py-2 text-sm" />
          <input aria-label="Note" value={note} maxLength={500} onChange={e => setNote(e.target.value)} placeholder="Reason (optional)" className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm" />
          <Button disabled={!selected.length || value === "" || Number(value) < 0 || submit.isPending} onClick={() => submit.mutate()}>Submit request</Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{rows.length} of {meters.length} meters</p>
      {meters.length === 0 ? <EmptyState title="No meters" message="No meters are linked to your landlord account yet." /> :
        <div className="overflow-x-auto"><table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-3"><input type="checkbox" aria-label="Select all" checked={rows.length > 0 && rows.every(r => selected.includes(r.id))} onChange={e => setSelected(e.target.checked ? [...new Set([...selected, ...rows.map(r => r.id)])] : selected.filter(id => !rows.some(r => r.id === id)))} /></th>{["Meter", "Type", "Property", "Unit", "Resident", "Price / unit", "Status"].map(label => <th key={label} className="px-3 py-3">{label}</th>)}</tr></thead>
          <tbody>{rows.map(m => <tr key={m.id} className="border-t border-border">
            <td className="px-3 py-3"><input type="checkbox" aria-label={`Select ${m.meter_number}`} checked={selected.includes(m.id)} onChange={() => toggle(m.id)} /></td>
            <td className="px-3 py-3 font-semibold">{m.meter_number}</td><td className="px-3 py-3">{titleCase(m.type)}</td>
            <td className="px-3 py-3">{m.property_name ?? "—"}</td><td className="px-3 py-3">{m.unit_label ?? "—"}</td><td className="px-3 py-3">{m.resident_name ?? "—"}</td>
            <td className="px-3 py-3">KES {m.price_per_unit.toFixed(2)}</td><td className="px-3 py-3"><StatusBadge value={m.status} /></td>
          </tr>)}{rows.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No meters match these filters.</td></tr>}</tbody>
        </table></div>}
      <div className="rounded-lg border border-border bg-card">
        <button type="button" onClick={() => setOpen(o => !o)} className="flex w-full items-center justify-between p-4 font-semibold">
          <span>My price change requests ({requests.data?.length ?? 0})</span>
          <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && <div className="overflow-x-auto border-t border-border"><table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-muted-foreground"><tr>{["Requested", "Meter", "Current", "Requested price", "Status", "Note", "Admin note"].map(l => <th key={l} className="px-3 py-3">{l}</th>)}</tr></thead>
          <tbody>{(requests.data ?? []).map(r => <tr key={r.id} className="border-t border-border">
            <td className="px-3 py-3">{new Date(r.created_at).toLocaleString()}</td><td className="px-3 py-3 font-semibold">{r.meter_number}</td>
            <td className="px-3 py-3">KES {r.current_price.toFixed(2)}</td><td className="px-3 py-3">KES {r.requested_price.toFixed(2)}</td>
            <td className="px-3 py-3"><StatusBadge value={r.status} /></td><td className="px-3 py-3">{r.note ?? "—"}</td><td className="px-3 py-3">{r.review_note ?? "—"}</td>
          </tr>)}{!requests.data?.length && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">{requests.isLoading ? "Loading…" : "No requests yet."}</td></tr>}</tbody>
        </table></div>}
      </div>
    </div>}
  </PortalLayout>;
}