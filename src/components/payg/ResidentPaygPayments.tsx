import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { getResidentPaygPlans, startPaygPayment, checkPaygPayment } from "@/lib/payg-payment.functions";
import { paygTerms, type PaygPlanView } from "@/lib/payg-payment";
import type { PaygProduct } from "@/lib/payg";

const kes = (cents: number) => `KES ${(cents / 100).toLocaleString("en-KE", { maximumFractionDigits: 2 })}`;

export function PaygPaymentButton({ product, plan, available = true }: { product: PaygProduct; plan?: PaygPlanView | undefined; available?: boolean }) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const pay = useServerFn(startPaygPayment);
  const qc = useQueryClient();
  let terms;
  try { terms = plan ?? paygTerms(product); } catch { terms = null; }
  const due = plan?.next_payment_cents ?? (terms ? terms.down_payment_cents || terms.instalment_cents : 0);
  const completed = plan?.remaining_cents === 0;
  const submit = async () => {
    if (busy || !requestId || !navigator.onLine) return;
    setBusy(true);
    try {
      const result = await pay({ data: { product_id: product.id, phone, request_id: requestId } });
      setMessage(result.message);
      await qc.invalidateQueries({ queryKey: ["resident-payg-plans"] });
      if (result.status === "failed") toast.error(result.message); else toast.info(result.message);
    } catch (e) { setMessage((e as Error).message || "Could not start the payment. Check status before trying again."); }
    finally { setBusy(false); }
  };
  return <div className="w-full space-y-2">
    <Button className="min-h-11 w-full" disabled={!terms || !available || plan?.pending || completed} onClick={() => { if (!navigator.onLine) { toast.error("Connect to the internet to make a payment."); return; } setRequestId(crypto.randomUUID()); setMessage(""); setOpen(true); }}><CreditCard className="mr-2 size-4" />{completed ? "Fully paid" : plan?.pending ? "Payment pending" : plan && plan.paid_cents >= plan.down_payment_cents ? "Pay instalment" : "Buy"}</Button>
    {!available && <p className="text-xs text-muted-foreground">M-Pesa payments are not configured yet.</p>}
    {!terms && <p className="text-xs text-muted-foreground">Payment plan not available yet.</p>}
    <Dialog open={open} onOpenChange={v => !busy && setOpen(v)}><DialogContent><DialogHeader><DialogTitle>{product.name}</DialogTitle></DialogHeader>
      {terms && <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-muted-foreground">Payment now</dt><dd className="font-semibold">{kes(due)}</dd></div><div><dt className="text-muted-foreground">Plan total</dt><dd>{kes(terms.total_cents)}</dd></div><div><dt className="text-muted-foreground">Down payment</dt><dd>{kes(terms.down_payment_cents)}</dd></div><div><dt className="text-muted-foreground">Instalments</dt><dd>{terms.instalment_count} × {kes(terms.instalment_cents)} ({terms.frequency})</dd></div></dl>}
      <p className="text-sm text-muted-foreground">Product delivery and device activation must be arranged with the vendor.</p>
      <div className="space-y-2"><Label htmlFor={`payg-phone-${product.id}`}>M-Pesa phone number</Label><Input id={`payg-phone-${product.id}`} type="tel" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} disabled={busy || Boolean(message)} /></div>
      {message && <p role="status" className="text-sm">{message}</p>}
      <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Close</Button><Button className="min-h-11" disabled={busy || Boolean(message) || !phone.trim()} onClick={submit}>{busy ? "Sending…" : `Pay ${kes(due)} with M-Pesa`}</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}

export function ResidentPaygPlans({ catalogue = false }: { catalogue?: boolean }) {
  const list = useServerFn(getResidentPaygPlans);
  const check = useServerFn(checkPaygPayment);
  const [busy, setBusy] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["resident-payg-plans"], queryFn: () => list(), refetchInterval: query => query.state.data?.some(p => p.pending) ? 10000 : false });
  const verify = async (id: string) => { if (!navigator.onLine) { toast.error("Connect to check payment status."); return; } setBusy(id); try { await check({ data: { id } }); await q.refetch(); } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); } };
  if (q.isLoading) return <p role="status" className="text-sm text-muted-foreground">Loading Pay-as-you-go plans…</p>;
  if (q.isError) return <div role="alert"><p className="text-sm text-destructive">Could not load your Pay-as-you-go plans.</p><Button variant="outline" onClick={() => void q.refetch()}>Try again</Button></div>;
  if (!q.data?.length) return catalogue ? null : <section className="space-y-2"><h2 className="font-semibold">My Pay-as-you-go plans</h2><p className="text-sm text-muted-foreground">No plans yet.</p><Link to="/resident/pay-as-you-go" className="text-sm text-primary">Browse products</Link></section>;
  return <section className="space-y-4"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">My Pay-as-you-go plans</h2>{!catalogue && <Link to="/resident/pay-as-you-go" className="text-sm text-primary">View plans</Link>}</div><div className="grid gap-4 sm:grid-cols-2">{q.data.map(plan => <article key={plan.id} className="space-y-3 rounded-lg border border-border bg-card p-4"><h3 className="font-semibold">{plan.product_name}</h3><progress className="h-3 w-full accent-primary" max={plan.total_cents} value={plan.paid_cents} aria-label={`${plan.product_name} confirmed payment progress`} /><div className="grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-muted-foreground">Confirmed paid</p><p>{kes(plan.paid_cents)}</p></div><div><p className="text-xs text-muted-foreground">Remaining</p><p>{kes(plan.remaining_cents)}</p></div></div><p className="text-sm">{plan.instalments_paid} of {plan.instalment_count} instalments paid{plan.paid_cents < plan.down_payment_cents ? " · Down payment pending" : ""}</p>
    {plan.payments.slice(0, 3).map(payment => <div key={payment.id} className="space-y-1 border-t border-border pt-2 text-sm"><p>{kes(payment.amount_cents)} · {payment.status === "completed" ? "Confirmed" : payment.status === "failed" ? "Not completed" : "Awaiting confirmation"}</p>{payment.receipt && <p className="text-xs text-muted-foreground">Receipt: {payment.receipt}</p>}{payment.error_message && <p className="text-xs text-muted-foreground">{payment.error_message}</p>}{["pending", "uncertain", "initiated"].includes(payment.status) && <Button variant="outline" size="sm" className="min-h-11" disabled={busy !== null} onClick={() => void verify(payment.id)}><RefreshCw className="mr-2 size-4" />{busy === payment.id ? "Checking…" : "Check payment status"}</Button>}</div>)}
    {catalogue ? <PaygPaymentButton product={{ id: plan.product_id, name: plan.product_name } as PaygProduct} plan={plan} /> : <Link to="/resident/pay-as-you-go" className="text-sm text-primary">{plan.remaining_cents === 0 ? "View completed plan" : "Make a payment"}</Link>}
  </article>)}</div></section>;
}