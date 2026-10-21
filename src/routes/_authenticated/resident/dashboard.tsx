import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot, FileText, KeyRound, Receipt, Wrench } from "lucide-react";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { getResidentHome } from "@/lib/resident-portal.functions";
import { PURCHASE_LABEL, type PurchaseStatus } from "@/lib/resident-portal";
import { Badge, Card, Empty, Stat, kes, residentHead, when } from "@/components/resident/ResidentUI";

export const Route = createFileRoute("/_authenticated/resident/dashboard")({
  head: residentHead("Overview", "Your homes, prepaid meters, token purchases and service requests in one place."),
  loader: () => checkRoleAccess({ data: { role: "resident" } }),
  component: ResidentDashboard,
  errorComponent: () => <p className="p-8 text-sm">Could not load this dashboard.</p>,
});

function ResidentDashboard() {
  const access = Route.useLoaderData();
  const fetchHome = useServerFn(getResidentHome);
  const q = useQuery({ queryKey: ["resident-home"], queryFn: () => fetchHome(), enabled: access.allowed });
  const d = q.data;
  const byType = (t: string) => d?.meters.filter((m) => m.type === t).length ?? 0;

  return (
    <DashboardShell access={access} title={d ? `Welcome, ${d.name}` : "Resident dashboard"} description="Your homes, meters, purchases and requests.">
      {q.isLoading && <p className="text-sm text-muted-foreground">Loading your account…</p>}
      {q.error && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {d && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="My homes" value={d.homes.length} to="/resident/meters" />
            <Stat label="My meters" value={d.meters.length} hint={`${byType("Electricity")} electricity · ${byType("Water")} water · ${byType("Gas")} gas`} to="/resident/meters" />
            <Stat label="Paid this month" value={kes(d.paidThisMonth)} hint="Token purchases" to="/resident/transactions" />
            <Stat label="Active requests" value={d.activeJobs} to="/resident/jobs" />
          </div>
          <p className="text-xs text-muted-foreground">
            Live meter balances aren't shown: your meters' vending services don't report a reliable balance. Rent and service charge balances will appear once billing goes live.
          </p>

          <div className="grid gap-3 sm:grid-cols-5">
            {[
              { to: "/resident/buy-tokens", label: "Buy Tokens", icon: KeyRound },
              { to: "/resident/bills", label: "Pay Rent", icon: Receipt },
              { to: "/resident/statements", label: "View Statement", icon: FileText },
              { to: "/resident/jobs", label: "Request Maintenance", icon: Wrench },
              { to: "/resident/support", label: "Get Help", icon: Bot },
            ].map((a) => (
              <Link key={a.to} to={a.to as never} className="btn-outline flex items-center justify-center gap-2 py-3">
                <a.icon className="size-4" /> {a.label}
              </Link>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="My homes">
              {d.homes.length === 0 ? <Empty>No home is linked to your account yet. Ask your property manager to assign your unit.</Empty> : (
                <ul className="divide-y divide-border">
                  {d.homes.map((h) => (
                    <li key={h.unit_id} className="py-3 text-sm">
                      <p className="font-medium text-foreground">{h.property_name} · Unit {h.unit_number}</p>
                      <p className="text-muted-foreground">{h.address}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{h.meters.join(" · ") || "No meters"}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Recent token purchases" action={<Link to="/resident/transactions" className="text-xs text-primary">View all</Link>}>
              {d.recentPurchases.length === 0 ? <Empty>No purchases yet.</Empty> : (
                <ul className="divide-y divide-border">
                  {d.recentPurchases.map((p) => (
                    <li key={p.id} className="flex items-center justify-between py-3 text-sm">
                      <div><p className="font-medium text-foreground">{kes(p.amount)} · {p.meter_number}</p><p className="text-xs text-muted-foreground">{when(p.created_at)}</p></div>
                      <Badge status={p.status}>{PURCHASE_LABEL[p.status as PurchaseStatus] ?? p.status}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Service requests" action={<Link to="/resident/jobs" className="text-xs text-primary">View all</Link>}>
              {d.recentJobs.length === 0 ? <Empty>No service requests.</Empty> : (
                <ul className="divide-y divide-border">
                  {d.recentJobs.map((j: any) => (
                    <li key={j.id} className="flex items-center justify-between py-3 text-sm">
                      <div><p className="font-medium text-foreground">{j.request_number} · {j.issue_type}</p><p className="text-xs text-muted-foreground">{when(j.created_at)}</p></div>
                      <Badge status={j.status}>{String(j.status).replace(/_/g, " ")}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Notifications" action={<Link to="/resident/notifications" className="text-xs text-primary">View all</Link>}>
              {d.notifications.length === 0 ? <Empty>You're all caught up.</Empty> : (
                <ul className="divide-y divide-border">
                  {d.notifications.map((n: any) => (
                    <li key={n.id} className="py-3 text-sm">
                      <p className={n.read_at ? "text-muted-foreground" : "font-medium text-foreground"}>{n.title}</p>
                      <p className="text-xs text-muted-foreground">{n.message}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
