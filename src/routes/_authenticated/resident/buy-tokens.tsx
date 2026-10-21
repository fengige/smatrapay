import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { checkRoleAccess } from "@/lib/auth.functions";
import { DashboardShell } from "@/components/DashboardShell";
import { getResidentHome, quoteTokenPurchase, startTokenPurchase } from "@/lib/resident-portal.functions";
import { validatePurchaseAmount } from "@/lib/resident-portal";
import { PurchaseStatusCard } from "@/components/resident/PurchaseStatusCard";
import { Card, Empty, field, kes, residentHead } from "@/components/resident/ResidentUI";

export const Route = createFileRoute("/_authenticated/resident/buy-tokens")({
  head: residentHead("Buy Tokens", "Buy electricity, water or gas tokens for your meters with M-Pesa."),
  validateSearch: (s: Record<string, unknown>) => ({ meter: typeof s.meter === "string" ? s.meter : undefined, purchase: typeof s.purchase === "string" ? s.purchase : undefined }),
  loader: () => checkRoleAccess({ data: { role: "resident" } }),
  component: Page,
  errorComponent: () => <p className="p-8 text-sm">Could not load Buy Tokens.</p>,
});

const PRESETS = [100, 200, 500, 1000];

function Page() {
  const access = Route.useLoaderData();
  const search = Route.useSearch();
  const fetchHome = useServerFn(getResidentHome);
  const quoteFn = useServerFn(quoteTokenPurchase);
  const startFn = useServerFn(startTokenPurchase);
  const home = useQuery({ queryKey: ["resident-home"], queryFn: () => fetchHome(), enabled: access.allowed });
  const meters = (home.data?.meters ?? []).filter((m) => m.status === "active");
  const [meterId, setMeterId] = useState(search.meter ?? "");
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState("");
  const [purchaseId, setPurchaseId] = useState<string | null>(search.purchase ?? null);
  const requestId = useMemo(() => crypto.randomUUID(), [meterId, amount, phone]);
  useEffect(() => { if (!meterId && meters[0]) setMeterId(meters[0].id); }, [meters, meterId]);
  const meter = meters.find((m) => m.id === meterId);
  const amt = Number(amount);
  const amtErr = amount ? validatePurchaseAmount(amt) : null;

  const quote = useQuery({
    queryKey: ["resident-quote", meterId, amt],
    queryFn: () => quoteFn({ data: { meter_id: meterId, amount: amt } }),
    enabled: !!meterId && !!amount && !amtErr,
  });
  const start = useMutation({
    mutationFn: () => startFn({ data: { meter_id: meterId, amount: amt, phone, request_id: requestId } }),
    onSuccess: (r) => { setPurchaseId(r.id); (r.status === "payment_failed" ? toast.error : toast.success)(r.message); },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <DashboardShell access={access} title="Buy Tokens" description="Pay with M-Pesa. Your token appears here once the payment is confirmed.">
      {purchaseId ? <PurchaseStatusCard id={purchaseId} onNew={() => { setPurchaseId(null); setAmount(""); }} /> : home.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : meters.length === 0 ? (
        <Empty>You have no active meters. Ask your property manager to link and activate your meter.</Empty>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <Card title="Purchase details">
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); start.mutate(); }}>
              <label className="block text-sm">Meter
                <select className={`${field} mt-1`} value={meterId} onChange={(e) => setMeterId(e.target.value)}>
                  {meters.map((m) => <option key={m.id} value={m.id}>{m.type} · {m.meter_number} · {m.property_name} {m.unit_number}</option>)}
                </select>
              </label>
              <div className="text-sm">Amount (KES)
                <div className="mt-1 flex flex-wrap gap-2">
                  {PRESETS.map((p) => <button type="button" key={p} onClick={() => setAmount(String(p))} className={amt === p ? "btn-primary px-3" : "btn-outline px-3"}>{p}</button>)}
                </div>
                <input className={`${field} mt-2`} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))} placeholder="Or enter an amount" />
                {amtErr && <p className="mt-1 text-xs text-destructive">{amtErr}</p>}
              </div>
              <label className="block text-sm">M-Pesa phone number
                <input className={`${field} mt-1`} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07XX XXX XXX" inputMode="tel" />
              </label>
              <button className="btn-primary w-full" disabled={!meter || !amount || !!amtErr || phone.replace(/\D/g, "").length < 9 || start.isPending}>
                {start.isPending ? "Sending M-Pesa prompt…" : `Pay ${amount ? kes(amt) : ""} with M-Pesa`}
              </button>
            </form>
          </Card>
          <Card title="Summary">
            {meter && <p className="text-sm"><span className="font-mono">{meter.meter_number}</span> · {meter.type}<br /><span className="text-muted-foreground">{meter.property_name}, unit {meter.unit_number}</span></p>}
            {quote.data ? (
              <dl className="mt-4 space-y-2 text-sm">
                <Row k="You pay" v={kes(quote.data.total_to_pay)} />
                <Row k={`Commission (${quote.data.commission_percentage}%)`} v={`− ${kes(quote.data.commission_amount)}`} />
                <Row k={`VAT on commission (${quote.data.vat_on_commission_percentage}%)`} v={`− ${kes(quote.data.vat_on_commission_amount)}`} />
                <Row k="Token value" v={kes(quote.data.net_amount)} strong />
                {quote.data.estimated_units != null && <Row k="Estimated units" v={String(quote.data.estimated_units)} />}
              </dl>
            ) : <p className="mt-4 text-sm text-muted-foreground">Enter an amount to see the breakdown.</p>}
            {quote.error && <p className="mt-2 text-xs text-destructive">{(quote.error as Error).message}</p>}
          </Card>
        </div>
      )}
    </DashboardShell>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return <div className={`flex justify-between ${strong ? "font-semibold text-foreground" : "text-muted-foreground"}`}><dt>{k}</dt><dd>{v}</dd></div>;
}

