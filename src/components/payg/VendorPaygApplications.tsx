import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getVendorPaygApplicationDetail, listVendorPaygApplications, reviewVendorPaygApplication } from "@/lib/vendor-payg-applications.functions";

const kes = (c: number) => `KES ${(Number(c) / 100).toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const date = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" }) : "—");
const tone = (s: string) => (s === "approved" || s === "completed" || s === "paid" ? "default" : s === "declined" || s === "failed" || s === "overdue" ? "destructive" : "secondary") as "default" | "destructive" | "secondary";

export function VendorPaygApplications() {
  const list = useServerFn(listVendorPaygApplications);
  const review = useServerFn(reviewVendorPaygApplication);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["vendor-payg-applications"], queryFn: () => list() });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [viewId, setViewId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; name: string; status: "approved" | "declined" } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const rows = (q.data ?? []).filter(a => (status === "all" || a.status === status) && `${a.full_name} ${a.phone} ${a.product_name}`.toLowerCase().includes(search.toLowerCase()));
  const submit = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      await review({ data: { id: confirm.id, status: confirm.status, note } });
      toast.success(confirm.status === "approved" ? "Application approved — payment plan created" : "Application rejected");
      setConfirm(null); setNote("");
      await qc.invalidateQueries({ queryKey: ["vendor-payg-applications"] });
      await qc.invalidateQueries({ queryKey: ["vendor-payg-application"] });
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  return <div className="space-y-4">
    <div className="flex flex-wrap gap-2">
      <Input className="max-w-xs" placeholder="Search resident, phone or product" value={search} onChange={e => setSearch(e.target.value)} />
      <select aria-label="Status" className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={status} onChange={e => setStatus(e.target.value)}>
        <option value="all">All statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="declined">Rejected</option>
      </select>
    </div>
    {q.isLoading ? <p className="text-sm text-muted-foreground">Loading applications…</p>
      : q.isError ? <p className="text-sm text-destructive">Could not load applications.</p>
      : rows.length === 0 ? <p className="text-sm text-muted-foreground">No resident applications yet.</p>
      : <div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Resident</TableHead><TableHead>Phone</TableHead><TableHead>Product</TableHead><TableHead>Applied</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
        <TableBody>{rows.map(a => <TableRow key={a.id}>
          <TableCell className="font-medium">{a.full_name}</TableCell><TableCell>{a.phone}</TableCell><TableCell>{a.product_name}</TableCell><TableCell>{date(a.created_at)}</TableCell>
          <TableCell><Badge variant={tone(a.status)}>{a.status === "declined" ? "Rejected" : a.status.charAt(0).toUpperCase() + a.status.slice(1)}</Badge></TableCell>
          <TableCell className="space-x-2 whitespace-nowrap text-right">
            <Button size="sm" variant="outline" onClick={() => setViewId(a.id)}>{a.plan_id ? "View plan" : "View"}</Button>
            {a.status === "pending" && <><Button size="sm" onClick={() => setConfirm({ id: a.id, name: a.full_name, status: "approved" })}>Approve</Button><Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirm({ id: a.id, name: a.full_name, status: "declined" })}>Reject</Button></>}
          </TableCell></TableRow>)}</TableBody></Table></div>}

    <AlertDialog open={!!confirm} onOpenChange={o => !o && !busy && setConfirm(null)}><AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>{confirm?.status === "approved" ? "Approve" : "Reject"} application from {confirm?.name}?</AlertDialogTitle>
        <AlertDialogDescription>{confirm?.status === "approved" ? "This creates the resident's payment plan using the terms they accepted. It cannot be undone." : "The resident will see the application as rejected. It cannot be reopened."}</AlertDialogDescription></AlertDialogHeader>
      <Textarea placeholder="Note for the resident (optional)" maxLength={1000} value={note} onChange={e => setNote(e.target.value)} />
      <AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={e => { e.preventDefault(); void submit(); }}>{busy ? "Saving…" : "Confirm"}</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent></AlertDialog>

    <Dialog open={!!viewId} onOpenChange={o => !o && setViewId(null)}><DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
      <DialogHeader><DialogTitle>Application details</DialogTitle></DialogHeader>
      {viewId && <Detail id={viewId} />}
    </DialogContent></Dialog>
  </div>;
}

function Detail({ id }: { id: string }) {
  const read = useServerFn(getVendorPaygApplicationDetail);
  const q = useQuery({ queryKey: ["vendor-payg-application", id], queryFn: () => read({ data: { id } }) });
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (q.isError || !q.data) return <p className="text-sm text-destructive">Could not load this application.</p>;
  const { application: a, events, plan } = q.data as any;
  return <div className="space-y-5 text-sm">
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
      {([["Resident", a.full_name], ["Phone", a.phone], ["Product", a.product_name], ["Applied", date(a.created_at)], ["Status", a.status === "declined" ? "Rejected" : a.status], ["Reviewed", date(a.reviewed_at)], ["Delivery address", a.delivery_address], ["Notes", a.notes || "—"], ["Review note", a.review_note || "—"]] as const).map(([k, v]) => <div key={k}><dt className="text-xs text-muted-foreground">{k}</dt><dd className="capitalize-first break-words">{v}</dd></div>)}
    </dl>
    {events.length > 0 && <div><h3 className="mb-1 font-semibold">Status history</h3><ul className="space-y-1">{events.map((e: any, i: number) => <li key={i} className="text-muted-foreground">{date(e.created_at)} · {e.action.replace("vendor_", "").replace("declined", "rejected")}{e.action.startsWith("vendor_") ? " by vendor" : " by admin"}{e.note ? ` — ${e.note}` : ""}</li>)}</ul></div>}
    {plan && <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[["Plan price", plan.total_cents], ["Down payment", plan.down_payment_cents], ["Confirmed paid", plan.paid_cents], ["Remaining balance", plan.remaining_cents]].map(([k, v]) => <div key={k} className="rounded-md border p-3"><p className="text-xs text-muted-foreground">{k}</p><p className="font-semibold">{kes(v)}</p></div>)}
      </div>
      <p className="text-xs text-muted-foreground">{plan.instalments_paid} of {plan.instalment_count} {plan.frequency} instalments paid. Only confirmed M-Pesa payments count; pending or failed attempts are excluded.{plan.pending ? " A payment is awaiting confirmation." : ""}</p>
      <div><h3 className="mb-1 font-semibold">Payments made</h3>{plan.payments.length === 0 ? <p className="text-muted-foreground">No payments yet.</p> :
        <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Amount</TableHead><TableHead>Receipt</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>{plan.payments.map((p: any) => <TableRow key={p.id}><TableCell>{date(p.confirmed_at ?? p.created_at)}</TableCell><TableCell>{kes(p.amount_cents)}</TableCell><TableCell>{p.receipt ?? "—"}</TableCell><TableCell><Badge variant={tone(p.status)}>{p.status}</Badge></TableCell></TableRow>)}</TableBody></Table>}</div>
      <div><h3 className="mb-1 font-semibold">Payment schedule</h3><p className="mb-2 text-xs text-muted-foreground">Due dates are counted from the approval date.</p>
        <div className="max-h-80 overflow-y-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>#</TableHead><TableHead>Due</TableHead><TableHead>Amount</TableHead><TableHead>Paid</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>{plan.schedule.map((s: any) => <TableRow key={s.number}><TableCell>{s.label}</TableCell><TableCell>{date(s.due_date)}</TableCell><TableCell>{kes(s.amount_cents)}</TableCell><TableCell>{kes(s.paid_cents)}</TableCell><TableCell><Badge variant={tone(s.status)}>{s.status}</Badge></TableCell></TableRow>)}</TableBody></Table></div></div>
    </>}
  </div>;
}
