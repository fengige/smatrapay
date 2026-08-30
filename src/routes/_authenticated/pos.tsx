import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Copy,
  Gauge,
  Loader2,
  MessageSquare,
  Printer,
  Receipt,
  Search,
  ShoppingCart,
} from "lucide-react";
import { PortalLayout } from "@/components/PortalLayout";
import {
  issueMeterToken,
  listMeterTokens,
  searchTokenMeters,
  type IssuedToken,
  type TokenMeterMatch,
} from "@/lib/tokens.functions";

export const Route = createFileRoute("/_authenticated/pos")({
  head: () => ({
    meta: [
      { title: "POS — SmatraPay Admin" },
      {
        name: "description",
        content:
          "Point of sale counter for SmatraPay: look up a prepaid meter, take payment and vend a credit token instantly.",
      },
      { property: "og:title", content: "POS — SmatraPay Admin" },
      {
        property: "og:description",
        content: "Sell prepaid units over the counter and print or SMS the token receipt.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PosPage,
});

const QUICK_AMOUNTS = [100, 200, 500, 1000, 2000];

const PAYMENT_METHODS = [
  { id: "cash", label: "Cash" },
  { id: "mpesa", label: "M-Pesa" },
  { id: "card", label: "Card" },
  { id: "bank", label: "Bank transfer" },
] as const;

type PaymentMethod = (typeof PAYMENT_METHODS)[number]["id"];

function PosPage() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TokenMeterMatch[] | null>(null);
  const [meter, setMeter] = useState<TokenMeterMatch | null>(null);

  const [mode, setMode] = useState<"value" | "units">("value");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [sendSms, setSendSms] = useState(false);
  const [phone, setPhone] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [sale, setSale] = useState<IssuedToken | null>(null);
  const [reprint, setReprint] = useState<IssuedToken | null>(null);

  const runSearch = useServerFn(searchTokenMeters);
  const runIssue = useServerFn(issueMeterToken);
  const runList = useServerFn(listMeterTokens);

  const search = useMutation({
    mutationFn: async () => runSearch({ data: { q: query.trim() } } as never),
    onSuccess: (rows: unknown) => {
      const list = rows as TokenMeterMatch[];
      setResults(list);
      setMeter(list.length === 1 ? list[0]! : null);
      if (!list.length) toast.info("No meters matched that search");
    },
    onError: (err: Error) => toast.error(err.message || "Search failed"),
  });

  const recent = useQuery({
    queryKey: ["meter-tokens", meter?.id ?? null],
    queryFn: async () =>
      (await runList({ data: { meter_id: meter?.id ?? null } } as never)) as IssuedToken[],
  });

  const amountNumber = Number(amount);
  const rate = meter?.price_per_unit ?? 0;
  const units = useMemo(() => {
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) return 0;
    if (mode === "units") return amountNumber;
    return rate > 0 ? amountNumber / rate : 0;
  }, [amountNumber, mode, rate]);
  const value = mode === "units" ? amountNumber * rate : amountNumber;

  const amountError =
    amount.trim() === ""
      ? "Enter the amount paid"
      : !Number.isFinite(amountNumber) || amountNumber <= 0
        ? "Amount must be greater than zero"
        : rate <= 0
          ? "This meter has no price per unit configured"
          : null;
  const phoneError = sendSms && phone.trim().length < 7 ? "Enter a valid phone number" : null;
  const referenceError =
    method !== "cash" && reference.trim().length < 4
      ? "A payment reference is required for non-cash payments"
      : null;

  const canSell =
    !!meter && meter.status === "active" && !amountError && !phoneError && !referenceError;

  const sell = useMutation({
    mutationFn: async () =>
      (await runIssue({
        data: {
          meter_id: meter!.id,
          action: "credit" as const,
          units: Number(units.toFixed(2)),
          amount: Number(value.toFixed(2)),
          reference: `${method.toUpperCase()}${reference.trim() ? ` ${reference.trim()}` : ""}`,
          customer_phone: sendSms ? phone.trim() : null,
          sms_requested: sendSms,
          expires_in_days: 30,
        },
      } as never)) as IssuedToken,
    onSuccess: (issued) => {
      setSale(issued);
      setConfirming(false);
      setAmount("");
      setReference("");
      toast.success("Sale complete — token vended");
      if (issued.sms_requested)
        toast.info(`Token queued for SMS delivery to ${issued.customer_phone}`);
      void queryClient.invalidateQueries({ queryKey: ["meter-tokens"] });
    },
    onError: (err: Error) => toast.error(err.message || "Sale failed"),
  });

  const money = (n: number) => `KES ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <PortalLayout
      roles={["admin"]}
      title="POS"
      description="Counter sales: find the customer's meter, take payment and vend prepaid units"
    >
      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          {/* Meter search */}
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Search className="size-4 text-primary" />
              <h2 className="font-semibold">Customer / Meter Lookup</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Search by meter number, serial number, or customer name / phone.
            </p>

            <form
              className="mt-4 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (query.trim().length >= 2) search.mutate();
                else toast.error("Enter at least 2 characters");
              }}
            >
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. 04512345678 or 0712 345 678"
                aria-label="Meter search"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <button
                type="submit"
                disabled={search.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {search.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Search className="size-4" />
                )}
                Search
              </button>
            </form>

            {results && results.length > 1 && (
              <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto">
                {results.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setMeter(r)}
                      className={`w-full rounded-xl border p-3 text-left text-sm transition ${
                        meter?.id === r.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-accent/10"
                      }`}
                    >
                      <span className="font-medium">{r.meter_number}</span>
                      <span className="block text-xs text-muted-foreground">
                        {r.customer_name ?? "Unassigned"} · {r.property_name ?? "No property"}{" "}
                        {r.unit_label ?? ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {results && results.length === 0 && (
              <p className="mt-4 rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                No meters matched that search. Try the full meter number or the customer&apos;s
                phone number.
              </p>
            )}

            {meter && (
              <dl className="mt-5 space-y-2 rounded-xl border border-border bg-muted/30 p-4 text-sm">
                <div className="flex items-center gap-2 pb-1">
                  <Gauge className="size-4 text-primary" />
                  <span className="font-semibold">{meter.meter_number}</span>
                  <span
                    className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                      meter.status === "active"
                        ? "bg-emerald-500/15 text-emerald-600"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {meter.status}
                  </span>
                </div>
                {[
                  ["Serial", meter.serial_number],
                  ["Utility", meter.type],
                  ["Rate", `${meter.price_per_unit.toFixed(2)} / unit`],
                  ["Property", meter.property_name ?? "—"],
                  ["Unit", meter.unit_label ?? "—"],
                  ["Customer", meter.customer_name ?? "Unassigned"],
                  ["Customer phone", meter.customer_phone ?? "—"],
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="text-right font-medium capitalize">{val}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>

          {/* Sale */}
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <ShoppingCart className="size-4 text-primary" />
              <h2 className="font-semibold">New Sale</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {meter
                ? `Selling units for ${meter.meter_number}`
                : "Select a meter on the left to start a sale."}
            </p>

            <fieldset disabled={!meter} className="mt-4 space-y-5 disabled:opacity-60">
              <div className="inline-flex rounded-lg border border-border p-1 text-sm">
                {(["value", "units"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    aria-pressed={mode === m}
                    className={`rounded-md px-3 py-1.5 font-medium capitalize ${
                      mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                    }`}
                  >
                    By {m}
                  </button>
                ))}
              </div>

              <div className="space-y-1">
                <label htmlFor="pos-amount" className="text-sm font-medium">
                  {mode === "value" ? "Amount paid (KES)" : "Units"}
                </label>
                <input
                  id="pos-amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  aria-invalid={!!amountError}
                  placeholder={mode === "value" ? "500" : "20"}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
                {amountError ? (
                  <p className="text-xs text-destructive">{amountError}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    ≈ {units.toFixed(2)} units · {money(value)}
                  </p>
                )}
                {mode === "value" && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {QUICK_AMOUNTS.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setAmount(String(q))}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent/10"
                      >
                        {q.toLocaleString()}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <span className="text-sm font-medium">Payment method</span>
                <div className="grid gap-2 sm:grid-cols-4">
                  {PAYMENT_METHODS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setMethod(p.id)}
                      aria-pressed={method === p.id}
                      className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
                        method === p.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-accent/10"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor="pos-ref" className="text-sm font-medium">
                  Payment reference {method === "cash" ? "(optional)" : ""}
                </label>
                <input
                  id="pos-ref"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  aria-invalid={!!referenceError}
                  placeholder="M-Pesa code, till receipt or slip number"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
                {referenceError && <p className="text-xs text-destructive">{referenceError}</p>}
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={sendSms}
                    onChange={(e) => {
                      setSendSms(e.target.checked);
                      if (e.target.checked && !phone) setPhone(meter?.customer_phone ?? "");
                    }}
                    className="size-4 accent-primary"
                  />
                  <MessageSquare className="size-4 text-muted-foreground" />
                  Send receipt token by SMS
                </label>
                {sendSms && (
                  <div className="space-y-1">
                    <label htmlFor="pos-phone" className="text-sm font-medium">
                      Phone number
                    </label>
                    <input
                      id="pos-phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      aria-invalid={!!phoneError}
                      placeholder="+2547…"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                    {phoneError && <p className="text-xs text-destructive">{phoneError}</p>}
                  </div>
                )}
              </div>

              {meter && meter.status !== "active" && (
                <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  This meter is {meter.status}. Activate it before selling units.
                </p>
              )}

              <button
                type="button"
                onClick={() => setConfirming(true)}
                disabled={!canSell}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                <Receipt className="size-4" /> Charge {money(Number.isFinite(value) ? value : 0)} &
                Vend Token
              </button>
            </fieldset>
          </section>
        </div>

        {/* Receipt */}
        {sale && (
          <section className="rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              <Receipt className="size-4 text-emerald-600" /> Sale receipt
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {sale.units.toFixed(2)} units · {money(sale.amount)} · {sale.reference ?? "—"} ·{" "}
              {new Date(sale.created_at).toLocaleString()}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <code className="rounded-lg bg-background px-3 py-2 font-mono text-lg tracking-widest">
                {sale.token}
              </code>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(sale.token);
                  toast.success("Token copied");
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-accent/10"
              >
                <Copy className="size-4" /> Copy
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-accent/10"
              >
                <Receipt className="size-4" /> Print
              </button>
            </div>
          </section>
        )}

        {/* Recent sales */}
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-bold">
            {meter ? `Recent sales — ${meter.meter_number}` : "Recent sales"}
          </h2>
          {recent.isLoading ? (
            <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
          ) : (recent.data ?? []).length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No sales recorded yet.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4">When</th>
                    <th className="py-2 pr-4">Token</th>
                    <th className="py-2 pr-4">Units</th>
                    <th className="py-2 pr-4">Amount</th>
                    <th className="py-2 pr-4">Reference</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 text-right">Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {(recent.data ?? []).slice(0, 20).map((t) => (
                    <tr key={t.id} className="border-t border-border">
                      <td className="py-2 pr-4">{new Date(t.created_at).toLocaleString()}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{t.token}</td>
                      <td className="py-2 pr-4">{t.units.toFixed(2)}</td>
                      <td className="py-2 pr-4">{money(t.amount)}</td>
                      <td className="py-2 pr-4">{t.reference ?? "—"}</td>
                      <td className="py-2 pr-4 capitalize">{t.status}</td>
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          onClick={() => setReprint(t)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent/10"
                        >
                          <Printer className="size-3.5" /> Reprint
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {reprint && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Reprint receipt"
        >
          <div
            id="pos-reprint-receipt"
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-xl"
          >
            <h3 className="text-center font-semibold">SmatraPay receipt (reprint)</h3>
            <dl className="mt-3 space-y-1.5 text-sm">
              {[
                ["Meter", reprint.meter_number],
                ["Date", new Date(reprint.created_at).toLocaleString()],
                ["Units", reprint.units.toFixed(2)],
                ["Amount", money(reprint.amount)],
                ["Reference", reprint.reference ?? "—"],
                ["Status", reprint.status],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-right font-medium capitalize">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 rounded-lg bg-muted/40 p-3 text-center font-mono text-base tracking-widest">
              {reprint.token}
            </p>
            {reprint.status === "revoked" && (
              <p className="mt-2 text-center text-xs text-destructive">
                This token was revoked and can no longer be used.
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReprint(null)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent/10"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(reprint.token);
                  toast.success("Token copied");
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent/10"
              >
                <Copy className="size-4" /> Copy
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                <Printer className="size-4" /> Print
              </button>
            </div>
          </div>
        </div>
      )}

      {confirming && meter && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm sale"
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl">
            <h3 className="font-semibold">Confirm sale</h3>
            <dl className="mt-3 space-y-2 text-sm">
              {[
                ["Meter", meter.meter_number],
                ["Customer", meter.customer_name ?? "Unassigned"],
                ["Units", `${units.toFixed(2)}`],
                ["Amount", money(value)],
                ["Payment", PAYMENT_METHODS.find((p) => p.id === method)!.label],
                ["Reference", reference.trim() || "—"],
                ["SMS", sendSms ? phone.trim() : "No"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-right font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => sell.mutate()}
                disabled={sell.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {sell.isPending && <Loader2 className="size-4 animate-spin" />} Confirm & vend
              </button>
            </div>
          </div>
        </div>
      )}
    </PortalLayout>
  );
}
