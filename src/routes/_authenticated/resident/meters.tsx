import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { getResidentHome } from "@/lib/resident-portal.functions";
import { Badge, Card, Empty, day, field, residentHead, when } from "@/components/resident/ResidentUI";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/resident/meters")({
  head: residentHead("My Properties & Meters", "The homes, units and prepaid meters assigned to you."),
  loader: () => checkRoleAccess({ data: { role: "resident" } }),
  component: Page,
  errorComponent: () => <p className="p-8 text-sm">Could not load your meters.</p>,
});

function Page() {
  const access = Route.useLoaderData();
  const fetchHome = useServerFn(getResidentHome);
  const q = useQuery({ queryKey: ["resident-home"], queryFn: () => fetchHome(), enabled: access.allowed });
  const [f, setF] = useState({ property: "", unit: "", type: "", supplier: "", status: "" });
  const meters = (q.data?.meters ?? []).filter((m) =>
    (!f.property || m.property_name === f.property) && (!f.unit || m.unit_number === f.unit) &&
    (!f.type || m.type === f.type) && (!f.supplier || m.supplier === f.supplier) && (!f.status || m.status === f.status));
  const opts = (k: "property_name" | "unit_number" | "type" | "supplier" | "status") => [...new Set((q.data?.meters ?? []).map((m) => m[k]))];

  return (
    <DashboardShell access={access} title="My Properties & Meters" description="Homes and meters linked to your account.">
      {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {q.error && <div role="alert"><p className="text-sm text-destructive">Could not load homes and meters.</p><Button variant="outline" onClick={() => void q.refetch()}>Try again</Button></div>}
      {q.data && (
        <div className="space-y-6">
          <Card title="My homes">
            {q.data.homes.length === 0 ? <Empty>No home is linked to your account yet.</Empty> : (
              <div className="grid gap-4 md:grid-cols-2">
                {q.data.homes.map((h) => (
                  <div key={h.unit_id} className="rounded-xl border border-border p-4 text-sm">
                    <p className="font-semibold text-foreground">{h.property_name}</p>
                    <p className="text-muted-foreground">{h.address}</p>
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <dt className="text-muted-foreground">Unit</dt><dd>{h.unit_number}{h.building ? ` · ${h.building}` : ""}</dd>
                      <dt className="text-muted-foreground">Landlord</dt><dd>{h.landlord}</dd>
                      <dt className="text-muted-foreground">Lease start</dt><dd>{day(h.lease_start)}</dd>
                      <dt className="text-muted-foreground">Lease end</dt><dd>{h.lease_end ? day(h.lease_end) : "Ongoing"}</dd>
                    </dl>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card title="My meters">
            <div className="mb-4 grid gap-2 sm:grid-cols-5">
              {([["property", "property_name", "All properties"], ["unit", "unit_number", "All units"], ["type", "type", "All types"], ["supplier", "supplier", "All suppliers"], ["status", "status", "All statuses"]] as const).map(([k, col, all]) => (
                <select key={k} className={field} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} aria-label={all}>
                  <option value="">{all}</option>
                  {opts(col).map((o) => <option key={String(o)} value={String(o)}>{String(o)}</option>)}
                </select>
              ))}
            </div>
            {meters.length === 0 ? <Empty>No meters match.</Empty> : (
              <>
              <ul className="divide-y divide-border lg:hidden">{meters.map((m) => <li key={m.id} className="space-y-3 py-4"><div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3"><div className="min-w-0"><p className="text-sm font-semibold">{m.type}</p><p className="mt-1 font-mono text-sm">{m.meter_number}</p></div><Badge status={m.status}>{m.status}</Badge></div><p className="text-sm text-muted-foreground">{m.property_name} · Unit {m.unit_number}<br />{m.supplier} · {m.owner}</p><p className="text-xs text-muted-foreground">Last purchase: {when(m.last_purchase_at)}</p>{m.status === "active" && <Button asChild><Link to="/resident/buy-tokens" search={{ meter: m.id, purchase: undefined }}>Buy tokens</Link></Button>}</li>)}</ul>
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-muted-foreground">
                    <tr><th className="py-2 pr-4">Meter</th><th className="pr-4">Type</th><th className="pr-4">Home</th><th className="pr-4">Supplier</th><th className="pr-4">Managed by</th><th className="pr-4">Status</th><th className="pr-4">Last purchase</th><th /></tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {meters.map((m) => (
                      <tr key={m.id}>
                        <td className="py-3 pr-4 font-mono">{m.meter_number}</td>
                        <td className="pr-4">{m.type}</td>
                        <td className="pr-4">{m.property_name} · {m.unit_number}</td>
                        <td className="pr-4">{m.supplier}</td>
                        <td className="pr-4">{m.owner}{m.owner_type ? ` (${m.owner_type})` : ""}</td>
                        <td className="pr-4"><Badge status={m.status}>{m.status}</Badge></td>
                        <td className="pr-4">{when(m.last_purchase_at)}</td>
                        <td>{m.status === "active" && <Link to="/resident/buy-tokens" search={{ meter: m.id } as never} className="text-primary">Buy</Link>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}
            <p className="mt-3 text-xs text-muted-foreground">Live balances are unavailable — your vending services don't report them reliably.</p>
          </Card>
        </div>
      )}
    </DashboardShell>
  );
}
