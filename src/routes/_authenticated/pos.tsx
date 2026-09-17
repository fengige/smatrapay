import { useMemo, useRef, useState } from "react";
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
  bulkResendTokenSms,
  issueMeterToken,
  listMeterTokens,
  listTokenSmsLogs,
  resendTokenSms,
  searchTokenMeters,
  type IssuedToken,
  type SmsDeliveryStatus,
  type TokenMeterMatch,
  type TokenSmsLog,
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

/** Badge colours for an SMS delivery attempt result. */
function smsBadgeClass(status: SmsDeliveryStatus) {
  if (status === "sent") return "bg-emerald-500/15 text-emerald-500";
  if (status === "failed") return "bg-destructive/15 text-destructive";
  return "bg-amber-500/15 text-amber-500";
}

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
  const [smsTarget, setSmsTarget] = useState<IssuedToken | null>(null);
  const [smsPhone, setSmsPhone] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [historyFor, setHistoryFor] = useState<IssuedToken | null>(null);

  const runSearch = useServerFn(searchTokenMeters);
  const runIssue = useServerFn(issueMeterToken);
  const runList = useServerFn(listMeterTokens);
  const runResendSms = useServerFn(resendTokenSms);
  const runBulkResend = useServerFn(bulkResendTokenSms);
  const runSmsLogs = useServerFn(listTokenSmsLogs);

  const resendSms = useMutation({
    mutationFn: async () =>
      runResendSms({
        data: { id: smsTarget!.id, customer_phone: smsPhone.trim() || null },
      } as never),
    onSuccess: () => {
      toast.success(`Receipt queued for SMS delivery to ${smsPhone.trim()}`);
      setSmsTarget(null);
      setSmsPhone("");
      void queryClient.invalidateQueries({ queryKey: ["meter-tokens"] });
      void queryClient.invalidateQueries({ queryKey: ["token-sms-logs"] });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to send SMS"),
  });

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

  const recentRows = useMemo(() => (recent.data ?? []).slice(0, 20), [recent.data]);
  const recentIds = useMemo(() => recentRows.map((t) => t.id), [recentRows]);

  const smsLogs = useQuery({
    queryKey: ["token-sms-logs", recentIds],
    enabled: recentIds.length > 0,
    queryFn: async () =>
      (await runSmsLogs({ data: { token_ids: recentIds } } as never)) as TokenSmsLog[],
  });

  /** Newest attempt per token — logs come back newest first. */
  const latestLogByToken = useMemo(() => {
    const map = new Map<string, TokenSmsLog>();
    for (const log of smsLogs.data ?? []) if (!map.has(log.token_id)) map.set(log.token_id, log);
    return map;
  }, [smsLogs.data]);

  const logsByToken = useMemo(() => {
    const map = new Map<string, TokenSmsLog[]>();
    for (const log of smsLogs.data ?? []) {
      const list = map.get(log.token_id) ?? [];
      list.push(log);
      map.set(log.token_id, list);
    }
    return map;
  }, [smsLogs.data]);

  const selectable = useMemo(
    () => recentRows.filter((t) => t.status !== "revoked").map((t) => t.id),
    [recentRows],
  );
  const selectedRows = useMemo(
    () => recentRows.filter((t) => selected.includes(t.id)),
    [recentRows, selected],
  );

  const bulkResend = useMutation({
    mutationFn: async () =>
      (await runBulkResend({ data: { ids: selected } } as never)) as {
        queued: number;
        failed: number;
        results: { meter_number: string; phone: string; status: SmsDeliveryStatus; error: string | null }[];
      },
    onSuccess: (res) => {
      setBulkConfirm(false);
      setSelected([]);
      if (res.failed === 0) toast.success(`${res.queued} receipt(s) queued for SMS delivery`);
      else
        toast.warning(
          `${res.queued} queued, ${res.failed} failed — ${res.results
            .filter((r) => r.status === "failed")
            .slice(0, 3)
            .map((r) => `${r.meter_number}: ${r.error}`)
            .join("; ")}`,
        );
      void queryClient.invalidateQueries({ queryKey: ["meter-tokens"] });
      void queryClient.invalidateQueries({ queryKey: ["token-sms-logs"] });
    },
    onError: (err: Error) => toast.error(err.message || "Bulk SMS re-send failed"),
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

  // One id per attempt, so a double-click or retry cannot vend twice.
  const requestIdRef = useRef<string | null>(null);

  const sell = useMutation({
    mutationFn: async () =>
      (await runIssue({
        data: {
          meter_id: meter!.id,
          action: "credit" as const,
          vend_by_unit: mode === "units",
          request_id: (requestIdRef.current ??= crypto.randomUUID()),
          units: Number(units.toFixed(2)),
          amount: Number(value.toFixed(2)),
          reference: `${method.toUpperCase()}${reference.trim() ? ` ${reference.trim()}` : ""}`,
          customer_phone: sendSms ? phone.trim() : null,
          sms_requested: sendSms,
          expires_in_days: 30,
        },
      } as never)) as IssuedToken,
    onSuccess: (issued) => {
      requestIdRef.current = null;
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
                        {r.unit_label ?? ""} · {r.vending_software_name ?? "No vending software"}
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
                  ["Vending software", meter.vending_software_name ?? "—"],
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-bold">
              {meter ? `Recent sales — ${meter.meter_number}` : "Recent sales"}
            </h2>
            {selected.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{selected.length} selected</span>
                <button
                  type="button"
                  onClick={() => setSelected([])}
                  className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent/10"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => setBulkConfirm(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
                >
                  <MessageSquare className="size-3.5" /> Re-send {selected.length} by SMS
                </button>
              </div>
            )}
          </div>
          {recent.isLoading ? (
            <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
          ) : recentRows.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No sales recorded yet.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3">
                      <input
                        type="checkbox"
                        aria-label="Select all sales for SMS re-send"
                        checked={selectable.length > 0 && selected.length === selectable.length}
                        onChange={(e) => setSelected(e.target.checked ? selectable : [])}
                      />
                    </th>
                    <th className="py-2 pr-4">When</th>
                    <th className="py-2 pr-4">Token</th>
                    <th className="py-2 pr-4">Units</th>
                    <th className="py-2 pr-4">Amount</th>
                    <th className="py-2 pr-4">Reference</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">SMS</th>
                    <th className="py-2 text-right">Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRows.map((t) => {
                    const log = latestLogByToken.get(t.id);
                    return (
                      <tr key={t.id} className="border-t border-border">
                        <td className="py-2 pr-3">
                          <input
                            type="checkbox"
                            aria-label={`Select sale ${t.token} for SMS re-send`}
                            disabled={t.status === "revoked"}
                            checked={selected.includes(t.id)}
                            onChange={(e) =>
                              setSelected((prev) =>
                                e.target.checked ? [...prev, t.id] : prev.filter((id) => id !== t.id),
                              )
                            }
                          />
                        </td>
                        <td className="py-2 pr-4">{new Date(t.created_at).toLocaleString()}</td>
                        <td className="py-2 pr-4 font-mono text-xs">{t.token}</td>
                        <td className="py-2 pr-4">{t.units.toFixed(2)}</td>
                        <td className="py-2 pr-4">{money(t.amount)}</td>
                        <td className="py-2 pr-4">{t.reference ?? "—"}</td>
                        <td className="py-2 pr-4 capitalize">{t.status}</td>
                        <td className="py-2 pr-4">
                          {log ? (
                            <button
                              type="button"
                              onClick={() => setHistoryFor(t)}
                              title={`${log.status} · ${log.phone} · ${new Date(log.created_at).toLocaleString()}${log.error ? ` · ${log.error}` : ""}`}
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${smsBadgeClass(log.status)}`}
                            >
                              {log.status}
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">Not sent</span>
                          )}
                        </td>
                        <td className="py-2 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setReprint(t)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent/10"
                            >
                              <Printer className="size-3.5" /> Reprint
                            </button>
                            <button
                              type="button"
                              disabled={t.status === "revoked"}
                              title={
                                t.status === "revoked"
                                  ? "Revoked tokens cannot be re-sent"
                                  : "Re-send this receipt via SMS"
                              }
                              onClick={() => {
                                setSmsTarget(t);
                                setSmsPhone(t.customer_phone ?? "");
                              }}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <MessageSquare className="size-3.5" /> SMS
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Bulk re-send confirmation */}
        {bulkConfirm && (
          <div
            className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm bulk SMS re-send"
          >
            <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl">
              <h3 className="font-semibold">Re-send {selectedRows.length} receipt(s) by SMS</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Existing tokens are re-sent to the phone number on each sale. No new sales are created.
              </p>
              <ul className="mt-3 max-h-56 space-y-1 overflow-y-auto text-sm">
                {selectedRows.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 border-b border-border/60 py-1">
                    <span className="font-mono text-xs">{t.token}</span>
                    <span className={t.customer_phone ? "" : "text-destructive"}>
                      {t.customer_phone ?? "No phone on file"}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setBulkConfirm(false)}
                  disabled={bulkResend.isPending}
                  className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent/10"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => bulkResend.mutate()}
                  disabled={bulkResend.isPending}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
                >
                  {bulkResend.isPending ? <Loader2 className="size-4 animate-spin" /> : <MessageSquare className="size-4" />}
                  Send
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SMS delivery history */}
        {historyFor && (
          <div
            className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="SMS delivery history"
            onClick={(e) => {
              if (e.target === e.currentTarget) setHistoryFor(null);
            }}
          >
            <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl">
              <h3 className="font-semibold">SMS delivery history</h3>
              <p className="mt-1 font-mono text-xs text-muted-foreground">{historyFor.token}</p>
              <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto text-sm">
                {(logsByToken.get(historyFor.id) ?? []).map((log) => (
                  <li key={log.id} className="rounded-lg border border-border p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${smsBadgeClass(log.status)}`}>
                        {log.status}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(log.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="mt-1 text-xs">
                      {log.phone} · by {log.actor_name ?? "system"}
                    </p>
                    {log.error && <p className="mt-1 text-xs text-destructive">{log.error}</p>}
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setHistoryFor(null)}
                  className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent/10"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
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

      {smsTarget && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Re-send receipt via SMS"
          onClick={(e) => {
            if (e.target === e.currentTarget && !resendSms.isPending) setSmsTarget(null);
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl">
            <h3 className="font-semibold">Re-send receipt via SMS</h3>
            <dl className="mt-3 space-y-2 text-sm">
              {[
                ["Meter", smsTarget.meter_number],
                ["Token", smsTarget.token],
                ["Units", smsTarget.units.toFixed(2)],
                ["Amount", money(smsTarget.amount)],
                ["Date", new Date(smsTarget.created_at).toLocaleString()],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="text-right font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <label className="mt-4 block text-sm">
              <span className="text-muted-foreground">Send to phone number</span>
              <input
                type="tel"
                value={smsPhone}
                onChange={(e) => setSmsPhone(e.target.value)}
                placeholder="e.g. 0712 345 678"
                autoFocus
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
              />
            </label>
            <p className="mt-2 text-xs text-muted-foreground">
              The original sale is not changed — the existing token receipt is queued for SMS
              delivery to this number.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSmsTarget(null)}
                disabled={resendSms.isPending}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent/10 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => resendSms.mutate()}
                disabled={resendSms.isPending || smsPhone.trim().length < 7}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {resendSms.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <MessageSquare className="size-4" />
                )}
                Send SMS
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
