import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { getResidentHome, listMyPurchases } from "@/lib/resident-portal.functions";
import { buildTokenStatement } from "@/lib/resident-portal";
import { Card, Empty, day, field, kes, residentHead } from "@/components/resident/ResidentUI";

export const Route = createFileRoute("/_authenticated/resident/statements")({
  head: residentHead("My Statements", "Statements of your confirmed token payments by meter and date range."),
  loader: () => checkRoleAccess({ data: { role: "resident" } }),
  component: Page,
  errorComponent: () => <p className="p-8 text-sm">Could not load your statement.</p>,
});

function Page() {
  const access = Route.useLoaderData();
  const homeFn = useServerFn(getResidentHome);
  const listFn = useServerFn(listMyPurchases);
  const monthStart = new Date(); monthStart.setDate(1);
  const [f, setF] = useState({ meter_id: "", from: monthStart.toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10) });
  const home = useQuery({ queryKey: ["resident-home"], queryFn: () => homeFn(), enabled: access.allowed });
  const q = useQuery({ queryKey: ["resident-statement", f], queryFn: () => listFn({ data: { meter_id: f.meter_id || undefined, from: f.from, to: f.to } }), enabled: access.allowed });
  const st = buildTokenStatement((q.data ?? []).map((r) => ({ created_at: r.created_at, reference: r.mpesa_receipt_number ?? r.id.slice(0, 8), meter_number: r.meter_number, amount: r.amount, status: r.status })));

  const csv = () => {
    const rows = [["Date", "Reference", "Description", "Debit", "Credit", "Balance"], ...st.lines.map((l) => [day(l.date), l.reference, l.description, l.debit, l.credit, l.balance])];
    const blob = new Blob([rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `smatrapay-statement-${f.from}-to-${f.to}.csv`; a.click();
  };

  return (
    <DashboardShell access={access} title="My Statements" description="Utility token statement. Rent and service charge statements will be added when billing goes live.">
      <Card action={<div className="flex gap-2 print:hidden"><button className="btn-outline px-3" onClick={csv} disabled={!st.lines.length}>Export CSV</button><button className="btn-outline px-3" onClick={() => window.print()}>Print / PDF</button></div>} title="Token statement">
        <div className="mb-4 grid gap-2 sm:grid-cols-3 print:hidden">
          <select className={field} value={f.meter_id} onChange={(e) => setF({ ...f, meter_id: e.target.value })} aria-label="Meter">
            <option value="">All meters</option>
            {(home.data?.meters ?? []).map((m) => <option key={m.id} value={m.id}>{m.type} · {m.meter_number}</option>)}
          </select>
          <input type="date" className={field} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} aria-label="From" />
          <input type="date" className={field} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} aria-label="To" />
        </div>
        <p className="mb-3 text-sm text-muted-foreground">{home.data?.name} · {day(f.from)} – {day(f.to)} · Opening balance {kes(0)}</p>
        {st.lines.length === 0 ? <Empty>No confirmed payments in this period.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="py-2 pr-4">Date</th><th className="pr-4">Reference</th><th className="pr-4">Description</th><th className="pr-4 text-right">Debit</th><th className="pr-4 text-right">Credit</th><th className="text-right">Balance</th></tr></thead>
              <tbody className="divide-y divide-border">
                {st.lines.map((l, i) => (
                  <tr key={i}><td className="py-2 pr-4">{day(l.date)}</td><td className="pr-4">{l.reference}</td><td className="pr-4">{l.description}</td><td className="pr-4 text-right">{l.debit ? kes(l.debit) : ""}</td><td className="pr-4 text-right">{l.credit ? kes(l.credit) : ""}</td><td className="text-right">{kes(l.balance)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-4 text-right text-sm font-semibold">Closing balance {kes(st.closing)}</p>
        <p className="mt-1 text-xs text-muted-foreground">A positive closing balance means a payment was received and its token is still pending.</p>
      </Card>
    </DashboardShell>
  );
}
