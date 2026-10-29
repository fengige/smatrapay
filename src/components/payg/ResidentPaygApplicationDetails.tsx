import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { getResidentPaygApplications } from "@/lib/payg-approval.functions";
import { getResidentPaygApplicationDetail } from "@/lib/resident-payg-applications.functions";
import { getResidentPaygPlans } from "@/lib/payg-payment.functions";

const money = (c: number) => `KES ${(c / 100).toLocaleString("en-KE", { maximumFractionDigits: 2 })}`;
const date = (d: string | null) => d ? new Date(d).toLocaleDateString("en-KE", { dateStyle: "medium" }) : "—";
const status = (s: string) => s === "declined" ? "Rejected" : s === "pending" ? "Awaiting approval" : s.charAt(0).toUpperCase() + s.slice(1);

export function ResidentPaygApplicationDetails() {
  const read = useServerFn(getResidentPaygApplications);
  const readPlans = useServerFn(getResidentPaygPlans);
  const q = useQuery({ queryKey: ["resident-payg-applications"], queryFn: () => read(), refetchInterval: 30000 });
  const plans = useQuery({ queryKey: ["resident-payg-plans"], queryFn: () => readPlans(), refetchInterval: 30000 });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [id, setId] = useState<string | null>(null);
  const rows = (q.data ?? []).filter(a => (filter === "all" || a.status === filter) && a.product_name.toLowerCase().includes(search.toLowerCase()));
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center gap-3">
      <Input aria-label="Search applications" placeholder="Search product" className="min-h-11 sm:max-w-xs" value={search} onChange={e => setSearch(e.target.value)} />
      <select aria-label="Application status" className="h-11 rounded-md border border-input bg-background px-3 text-sm" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All statuses</option><option value="pending">Awaiting approval</option><option value="approved">Approved</option><option value="declined">Rejected</option></select>
      <Button variant="outline" className="min-h-11" disabled={q.isFetching || plans.isFetching} onClick={() => { void q.refetch(); void plans.refetch(); }}><RefreshCw className="mr-2 size-4" />Refresh</Button>
      <Button asChild variant="outline" className="min-h-11"><Link to="/resident/pay-as-you-go">Browse products</Link></Button>
    </div>
    {q.isPending ? <p role="status" className="text-sm text-muted-foreground">Loading applications…</p> : q.isError ? <p role="alert" className="text-sm text-destructive">Could not load applications. Please try again.</p> : !rows.length ? <p className="text-sm text-muted-foreground">{q.data.length ? "No applications match your filters." : "You have not submitted any Pay-as-you-go applications yet."}</p> : <div className="grid gap-4 lg:grid-cols-2">{rows.map(a => {
      const plan = plans.data?.find(p => p.application_id === a.id);
      return <article key={a.id} className="min-w-0 space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-2"><h2 className="break-words font-semibold">{a.product_name}</h2><Badge variant={a.status === "declined" ? "destructive" : a.status === "approved" ? "default" : "secondary"}>{status(a.status)}</Badge></div>
        <p className="text-xs text-muted-foreground">Applied {date(a.created_at)}</p>
        {a.review_note && <p className="whitespace-pre-wrap break-words text-sm">{a.review_note}</p>}
        {plan && <><progress aria-label={`${a.product_name} confirmed payment progress`} className="h-3 w-full accent-primary" max={plan.total_cents} value={Math.min(plan.paid_cents, plan.total_cents)} /><div className="grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-muted-foreground">Confirmed paid</p>{money(plan.paid_cents)}</div><div><p className="text-xs text-muted-foreground">Remaining balance</p>{money(plan.remaining_cents)}</div></div><p className="text-sm">{plan.instalments_paid} of {plan.instalment_count} instalments paid · {plan.remaining_cents === 0 ? "Fully paid" : "Active plan"}</p>{plan.pending && <p role="status" className="text-xs text-muted-foreground">A payment is awaiting confirmation.</p>}</>}
        {a.status === "approved" && plans.isError && <p role="alert" className="text-sm text-destructive">Payment progress is unavailable. Please refresh.</p>}
        <Button variant="outline" className="min-h-11" onClick={() => setId(a.id)}>View application & schedule</Button>
      </article>;
    })}</div>}
    <Dialog open={Boolean(id)} onOpenChange={open => !open && setId(null)}><DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>My application details</DialogTitle><DialogDescription>Application review and confirmed payment progress.</DialogDescription></DialogHeader>{id && <Details id={id} />}</DialogContent></Dialog>
  </div>;
}

function Details({ id }: { id: string }) {
  const read = useServerFn(getResidentPaygApplicationDetail);
  const q = useQuery({ queryKey: ["resident-payg-application-detail", id], queryFn: () => read({ data: { id } }), refetchInterval: 30000 });
  if (q.isPending) return <p role="status">Loading application…</p>;
  if (q.isError || !q.data) return <div role="alert"><p>Could not load this application.</p><Button variant="outline" onClick={() => void q.refetch()}>Try again</Button></div>;
  const { application: a, events, plan } = q.data;
  return <div className="space-y-5 text-sm">
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">{[["Product", a.product_name], ["Applicant", a.full_name], ["Phone", a.phone], ["Applied", date(a.created_at)], ["Status", status(a.status)], ["Reviewed", date(a.reviewed_at)], ["Delivery address", a.delivery_address], ["Your notes", a.notes || "—"], ["Review note", a.review_note || "—"]].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="whitespace-pre-wrap break-words">{value}</dd></div>)}</dl>
    <section><h3 className="mb-2 font-semibold">Status history</h3><ul className="space-y-2"><li>{date(a.created_at)} · Application submitted</li>{events.map((e, i) => <li key={i}>{date(e.created_at)} · {status(e.action.replace("vendor_", ""))}{e.note ? ` — ${e.note}` : ""}</li>)}</ul></section>
    {!plan ? <p className="text-muted-foreground">{a.status === "pending" ? "Your payment schedule will be available after approval." : a.status === "declined" ? "This application was rejected. No payment plan was created." : "No linked payment plan is available. Contact support."}</p> : <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[["Plan price", plan.total_cents], ["Down payment", plan.down_payment_cents], ["Confirmed paid", plan.paid_cents], ["Remaining balance", plan.remaining_cents]].map(([label, value]) => <div key={label} className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className="break-words font-semibold">{money(Number(value))}</p></div>)}</div>
      <p>{plan.instalments_paid} of {plan.instalment_count} {plan.frequency} instalments paid. Next payment: {money(plan.next_payment_cents)}.</p>
      <p className="text-xs text-muted-foreground">Only confirmed payments count towards progress. Pending, failed and uncertain payments are excluded.</p>
      <section><h3 className="mb-2 font-semibold">Payments made</h3>{!plan.payments.length ? <p className="text-muted-foreground">No payments yet.</p> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Amount</TableHead><TableHead>Receipt</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{plan.payments.map(p => <TableRow key={p.id}><TableCell>{date(p.created_at)}</TableCell><TableCell className="whitespace-nowrap">{money(p.amount_cents)}</TableCell><TableCell>{p.receipt ?? "—"}</TableCell><TableCell>{p.status === "completed" ? "Confirmed" : status(p.status)}</TableCell></TableRow>)}</TableBody></Table></div>}</section>
      <section><h3 className="mb-1 font-semibold">Payment schedule</h3><p className="mb-2 text-xs text-muted-foreground">Due dates start at approval; confirmed payments are allocated to the down payment, then instalments in order.</p><div className="max-h-80 overflow-auto rounded-md border border-border"><Table><TableHeader><TableRow><TableHead>Payment</TableHead><TableHead>Due</TableHead><TableHead>Amount</TableHead><TableHead>Paid</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{plan.schedule.map(s => <TableRow key={s.number}><TableCell className="whitespace-nowrap">{s.label}</TableCell><TableCell className="whitespace-nowrap">{date(s.due_date)}</TableCell><TableCell>{money(s.amount_cents)}</TableCell><TableCell>{money(s.paid_cents)}</TableCell><TableCell>{status(s.status)}</TableCell></TableRow>)}</TableBody></Table></div></section>
      <Button asChild variant="outline" className="min-h-11"><Link to="/resident/pay-as-you-go">Payments & status checks</Link></Button>
    </>}
  </div>;
}