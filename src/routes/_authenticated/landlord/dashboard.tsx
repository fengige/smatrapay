import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Building2, Gauge, Home, Users, Zap, Landmark, AlertTriangle, FileText } from "lucide-react";
import { getLandlordDashboard } from "@/lib/landlord-dashboard.functions";
import { formatUnits } from "@/lib/token-units";

const q = queryOptions({ queryKey: ["landlord-dashboard"], queryFn: () => getLandlordDashboard() });

export const Route = createFileRoute("/_authenticated/landlord/dashboard")({
  head: () => ({ meta: [{ title: "Landlord Dashboard · SmatraPay" }, { name: "description", content: "Your properties, meters, payments, tokens and resident applications." }, { property: "og:title", content: "Landlord Dashboard · SmatraPay" }, { property: "og:description", content: "Your properties, meters, payments, tokens and resident applications." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  loader: ({ context }) => (context as any).queryClient.ensureQueryData(q),
  component: LandlordDashboard,
  errorComponent: ({ error }: { error: Error }) => <p className="p-8 text-sm text-destructive">{error.message === "Access denied" ? "This dashboard is for landlord accounts." : "Could not load this dashboard."}</p>,
});

const kes = (n: number) => `KES ${n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (s: string) => new Date(s).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" });

function Stat({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground"><Icon className="h-4 w-4" />{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Badge({ s }: { s: string }) {
  const bad = ["failed", "rejected", "retry_pending", "revoked"].includes(s);
  const good = ["completed", "issued", "approved", "processed"].includes(s);
  return <span className={`rounded-full px-2 py-0.5 text-xs ${bad ? "bg-destructive/10 text-destructive" : good ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{s.replace(/_/g, " ")}</span>;
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3"><h2 className="font-semibold">{title}</h2>{action}</div>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

const Empty = ({ text }: { text: string }) => <p className="p-6 text-center text-sm text-muted-foreground">{text}</p>;

function LandlordDashboard() {
  const data = useSuspenseQuery(q).data as Awaited<ReturnType<typeof getLandlordDashboard>>;
  const c = data.counts, l = data.last30;
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Landlord dashboard</h1>
        <p className="text-sm text-muted-foreground">Your properties, meters, payments, tokens and resident applications.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Building2} label="Properties" value={c.properties} />
        <Stat icon={Home} label="Units" value={c.units} sub={`${c.occupiedUnits} occupied`} />
        <Stat icon={Gauge} label="Meters" value={c.meters} sub={`${c.activeMeters} active`} />
        <Stat icon={Users} label="Residents" value={c.residents} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat icon={Zap} label="Tokens · last 30 days" value={l.tokens} sub={`${kes(l.tokenAmount)} · ${formatUnits(l.tokenUnits)} units`} />
        <Stat icon={Landmark} label="Bank payments · last 30 days" value={l.payments} sub={kes(l.paymentAmount)} />
        <Stat icon={AlertTriangle} label="Payments needing attention" value={l.failedPayments} sub="Failed or waiting to retry" />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Recent bank payments" action={<Link to="/landlord/bank-payments" className="text-sm text-primary hover:underline">View all</Link>}>
          {data.recentPayments.length === 0 ? <Empty text="No bank payments on your meters yet." /> : (
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground"><tr><th className="px-4 py-2">Date</th><th className="px-4 py-2">Bank</th><th className="px-4 py-2">Meter</th><th className="px-4 py-2 text-right">Amount</th><th className="px-4 py-2">Status</th></tr></thead>
              <tbody>{data.recentPayments.map((p) => (
                <tr key={p.id} className="border-t" title={p.error ?? undefined}>
                  <td className="px-4 py-2 whitespace-nowrap">{when(p.at)}</td><td className="px-4 py-2">{p.bank ?? "—"}</td><td className="px-4 py-2">{p.meter ?? "—"}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">{kes(p.amount)}</td><td className="px-4 py-2"><Badge s={p.status ?? "—"} /></td>
                </tr>))}</tbody>
            </table>)}
        </Panel>

        <Panel title="Recent tokens">
          {data.recentTokens.length === 0 ? <Empty text="No tokens issued on your meters yet." /> : (
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground"><tr><th className="px-4 py-2">Date</th><th className="px-4 py-2">Meter</th><th className="px-4 py-2 text-right">Amount</th><th className="px-4 py-2 text-right">Units</th><th className="px-4 py-2">Status</th></tr></thead>
              <tbody>{data.recentTokens.map((t) => (
                <tr key={t.id} className="border-t">
                  <td className="px-4 py-2 whitespace-nowrap">{when(t.at)}</td><td className="px-4 py-2">{t.meter}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">{kes(t.amount)}</td><td className="px-4 py-2 text-right">{t.units == null ? "—" : formatUnits(t.units)}</td><td className="px-4 py-2"><Badge s={t.status} /></td>
                </tr>))}</tbody>
            </table>)}
        </Panel>
      </div>

      <Panel title="Resident applications" action={<span className="flex items-center gap-1 text-xs text-muted-foreground"><FileText className="h-3.5 w-3.5" />Pay-as-you-go, from residents in your units</span>}>
        {data.applications.length === 0 ? <Empty text="No applications from your residents yet." /> : (
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground"><tr><th className="px-4 py-2">Date</th><th className="px-4 py-2">Resident</th><th className="px-4 py-2">Product</th><th className="px-4 py-2">Status</th></tr></thead>
            <tbody>{data.applications.map((a) => (
              <tr key={a.id} className="border-t">
                <td className="px-4 py-2 whitespace-nowrap">{when(a.at)}</td><td className="px-4 py-2">{a.name ?? "—"}</td><td className="px-4 py-2">{a.product ?? "—"}</td><td className="px-4 py-2"><Badge s={a.status} /></td>
              </tr>))}</tbody>
          </table>)}
      </Panel>
    </div>
  );
}
