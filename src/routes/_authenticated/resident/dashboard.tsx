import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot, FileText, KeyRound, Receipt, Wrench } from "lucide-react";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { getResidentHome } from "@/lib/resident-portal.functions";
import { PURCHASE_LABEL, type PurchaseStatus } from "@/lib/resident-portal";
import { Badge, Card, Empty, Stat, kes, residentHead, when } from "@/components/resident/ResidentUI";
import { ResidentAvatar } from "@/components/resident/ResidentAvatar";
import { getResidentProfile } from "@/lib/resident-profile.functions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ResidentPaygPlans } from "@/components/payg/ResidentPaygPayments";

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
  const getProfile = useServerFn(getResidentProfile);
  const profile = useQuery({ queryKey: ["resident-profile"], queryFn: () => getProfile(), enabled: access.allowed });
  const byType = (t: string) => d?.meters.filter((m) => m.type === t).length ?? 0;

  return (
    <DashboardShell access={access} title={d ? `Welcome, ${d.name}` : "Resident dashboard"} description="Your homes, meters, purchases and requests.">
      {q.isLoading && <div role="status" aria-label="Loading your account" className="grid grid-cols-2 gap-3"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="col-span-2 h-44" /></div>}
      {q.error && <div role="alert" className="space-y-3"><p className="text-sm text-destructive">Could not load your account. Check your connection.</p><Button variant="outline" onClick={() => void q.refetch()}>Try again</Button></div>}
      {d && (
        <div className="space-y-6">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-border pb-4 lg:hidden"><div className="min-w-0"><p className="text-xs font-semibold text-muted-foreground">Your home, connected</p><h1 className="mt-1 text-xl font-bold">Hello, {d.name}</h1></div><ResidentAvatar name={d.name} photo={profile.data?.photo ?? null} size="detail" /></div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="My homes" value={d.homes.length} to="/resident/meters" />
            <Stat label="My meters" value={d.meters.length} hint={`${byType("Electricity")} electricity · ${byType("Water")} water · ${byType("Gas")} gas`} to="/resident/meters" />
            <Stat label="Paid this month" value={kes(d.paidThisMonth)} hint="Token purchases" to="/resident/transactions" />
            <Stat label="Active requests" value={d.activeJobs} to="/resident/jobs" />
          </div>
          <p className="text-xs text-muted-foreground">
            Live meter balances aren't shown: your meters' vending services don't report a reliable balance. Rent and service charge balances will appear once billing goes live.
          </p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              { to: "/resident/buy-tokens", label: "Buy Tokens", icon: KeyRound },
              { to: "/resident/bills", label: "Pay Rent", icon: Receipt },
              { to: "/resident/bills", label: "View Invoices", icon: FileText },
              { to: "/resident/jobs", label: "Request Maintenance", icon: Wrench },
              { to: "/resident/transactions", label: "View Receipts", icon: Bot },
            ].map((a) => (
              <Link key={a.label} to={a.to as never} className="btn-outline flex h-auto min-h-14 items-center justify-center gap-2 px-2 py-3 text-center">
                <a.icon className="size-4" /> {a.label}
              </Link>
            ))}
          </div>
          <div className="grid gap-4 border-y border-border py-4 sm:grid-cols-2"><div><p className="text-xs font-semibold text-muted-foreground">Outstanding rent</p><p className="mt-1 text-sm">Not available yet</p></div><div><p className="text-xs font-semibold text-muted-foreground">Next payment due</p><p className="mt-1 text-sm">No rent invoice available</p></div></div>

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
          <ResidentPaygPlans />
        </div>
      )}
    </DashboardShell>
  );
}
