import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { getResidentPaygApplications, submitPaygApplication } from "@/lib/payg-approval.functions";
import { paygApplicationSchema, type PaygApplication } from "@/lib/payg-approval";
import { paygTerms } from "@/lib/payg-payment";
import type { PaygProduct } from "@/lib/payg";

export function PaygApplyButton({ product, application }: { product: PaygProduct; application?: PaygApplication | undefined }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [full_name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [delivery_address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [accepted, setAccepted] = useState(false);
  const submit = useServerFn(submitPaygApplication);
  const qc = useQueryClient();
  let terms; try { terms = paygTerms(product); } catch { terms = null; }
  const apply = async () => {
    const parsed = paygApplicationSchema.safeParse({ product_id: product.id, full_name, phone, delivery_address, notes, accepted_terms: accepted });
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? "Check the application details"); return; }
    if (!navigator.onLine) { toast.error("Connect to submit your application."); return; }
    setBusy(true);
    try { await submit({ data: parsed.data }); await qc.invalidateQueries({ queryKey: ["resident-payg-applications"] }); setOpen(false); toast.success("Application submitted for approval"); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return <div className="w-full space-y-2"><Button className="min-h-11 w-full" disabled={Boolean(application) || !terms} onClick={() => setOpen(true)}>{application ? `Application ${application.status}` : "Apply for plan"}</Button>
    {!terms && <p className="text-xs text-muted-foreground">The vendor needs to complete or reconcile this payment plan.</p>}
    <Dialog open={open} onOpenChange={v => !busy && setOpen(v)}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Apply · {product.name}</DialogTitle></DialogHeader>
      {terms && <p className="text-sm">KES {terms.down_payment_cents / 100} down payment + {terms.instalment_count} {terms.frequency} instalments of KES {terms.instalment_cents / 100}. Total KES {terms.total_cents / 100}.</p>}
      <div className="space-y-2"><Label htmlFor="payg-app-name">Full name</Label><Input id="payg-app-name" maxLength={120} autoComplete="name" value={full_name} onChange={e => setName(e.target.value)} />
      <Label htmlFor="payg-app-phone">Contact phone</Label><Input id="payg-app-phone" type="tel" maxLength={13} autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} />
      <Label htmlFor="payg-app-address">Delivery address</Label><Textarea id="payg-app-address" maxLength={500} value={delivery_address} onChange={e => setAddress(e.target.value)} />
      <Label htmlFor="payg-app-notes">Additional details (optional)</Label><Textarea id="payg-app-notes" maxLength={1000} value={notes} onChange={e => setNotes(e.target.value)} />
      <label className="flex min-h-11 items-center gap-3 text-sm"><Checkbox checked={accepted} onCheckedChange={v => setAccepted(v === true)} />I accept these payment terms and request review before payment.</label></div>
      <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button disabled={busy || !accepted} onClick={() => void apply()}>{busy ? "Submitting…" : "Submit application"}</Button></DialogFooter>
    </DialogContent></Dialog></div>;
}

export function ResidentPaygApplications() {
  const read = useServerFn(getResidentPaygApplications);
  const q = useQuery({ queryKey: ["resident-payg-applications"], queryFn: () => read(), refetchInterval: 30000 });
  if (q.isPending) return <p role="status">Loading applications…</p>;
  if (q.isError) return <div role="alert">Could not load applications. <Button variant="outline" onClick={() => void q.refetch()}>Try again</Button></div>;
  if (!q.data.length) return null;
  return <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">My applications</h2><Button asChild variant="outline" className="min-h-11"><Link to="/resident/payg-applications">Status & schedules</Link></Button></div><div className="grid gap-3 sm:grid-cols-2">{q.data.map(a => <article key={a.id} className="rounded-lg border border-border p-4"><h3 className="font-medium">{a.product_name}</h3><p className="text-sm capitalize">{a.status === "pending" ? "Awaiting approval" : a.status}</p><p className="text-xs text-muted-foreground">Submitted {new Date(a.created_at).toLocaleDateString()}</p>{a.review_note && <p className="mt-2 whitespace-pre-wrap text-sm">{a.review_note}</p>}</article>)}</div></section>;
}