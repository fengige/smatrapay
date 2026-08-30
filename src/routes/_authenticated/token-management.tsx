import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Copy,
  Gauge,
  KeyRound,
  Loader2,
  MessageSquare,
  Search,
  Zap,
} from "lucide-react";
import PortalLayout from "@/components/PortalLayout";
import { searchTokenMeters, type TokenMeterMatch } from "@/lib/tokens.functions";

export const Route = createFileRoute("/_authenticated/token-management")({
  head: () => ({
    meta: [
      { title: "Token Management — SmatraPay Admin" },
      {
        name: "description",
        content:
          "Search prepaid meters and issue credit, key change, or clear tamper tokens for SmatraPay customers.",
      },
      { property: "og:title", content: "Token Management — SmatraPay Admin" },
      {
        property: "og:description",
        content: "Search prepaid meters and generate STS tokens for SmatraPay customers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TokenManagementPage,
});

type TokenAction = "credit" | "key_change" | "clear_tamper" | "clear_credit";

const ACTIONS: { id: TokenAction; label: string; hint: string }[] = [
  { id: "credit", label: "Issue Credit", hint: "Vend units or value onto the meter" },
  { id: "key_change", label: "Key Change", hint: "Rotate the meter supply group key" },
  { id: "clear_tamper", label: "Clear Tamper", hint: "Reset a tamper condition" },
  { id: "clear_credit", label: "Clear Credit", hint: "Zero the meter credit balance" },
];

function randomToken() {
  let out = "";
  for (let i = 0; i < 20; i += 1) out += Math.floor(Math.random() * 10);
  return out.replace(/(\d{4})(?=\d)/g, "$1-");
}

function TokenManagementPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TokenMeterMatch[] | null>(null);
  const [meter, setMeter] = useState<TokenMeterMatch | null>(null);

  const [action, setAction] = useState<TokenAction>("credit");
  const [mode, setMode] = useState<"value" | "units">("value");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [sendSms, setSendSms] = useState(false);
  const [phone, setPhone] = useState("");
  const [token, setToken] = useState<null | {
    value: string;
    units: number;
    amount: number;
    issuedAt: string;
  }>(null);

  const runSearch = useServerFn(searchTokenMeters);
  const search = useMutation({
    mutationFn: async () => runSearch({ data: { q: query.trim() } } as never),
    onSuccess: (rows: any) => {
      const list = rows as TokenMeterMatch[];
      setResults(list);
      setMeter(list.length === 1 ? list[0]! : null);
      if (!list.length) toast.info("No meters matched that search");
    },
    onError: (err: Error) => toast.error(err.message || "Search failed"),
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
      ? "Amount is required"
      : !Number.isFinite(amountNumber) || amountNumber <= 0
        ? "Enter an amount greater than zero"
        : mode === "value" && rate <= 0
          ? "This meter has no price per unit configured"
          : null;
  const phoneError = sendSms && phone.trim().length < 7 ? "Enter a valid phone number" : null;
  const needsAmount = action === "credit";
  const canGenerate =
    !!meter && (!needsAmount || !amountError) && !phoneError && meter.status === "active";

  const generate = () => {
    if (!meter || !canGenerate) return;
    const issuedAt = new Date().toISOString();
    setToken({
      value: randomToken(),
      units: needsAmount ? Number(units.toFixed(2)) : 0,
      amount: needsAmount ? Number(value.toFixed(2)) : 0,
      issuedAt,
    });
    toast.success("Token generated");
    if (sendSms) toast.info(`Token queued for SMS delivery to ${phone.trim()}`);
  };

  return (
    <PortalLayout>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">Token Management</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Search a prepaid meter, then issue credit or an engineering token for the customer.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          {/* Meter search */}
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Search className="size-4 text-primary" />
              <h2 className="font-semibold">Meter Search</h2>
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
                  ["Landlord", meter.owner_name ?? "—"],
                  [
                    "STS",
                    `SGC ${meter.sgc ?? "—"} · KRN ${meter.krn ?? "—"} · TI ${meter.ti ?? "—"}`,
                  ],
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="text-right font-medium capitalize">{val}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>

          {/* Token action */}
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <KeyRound className="size-4 text-primary" />
              <h2 className="font-semibold">Token Action</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {meter
                ? `Issuing for ${meter.meter_number}`
                : "Select a meter on the left to enable token actions."}
            </p>

            <fieldset disabled={!meter} className="mt-4 space-y-5 disabled:opacity-60">
              <div className="grid gap-2 sm:grid-cols-2">
                {ACTIONS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setAction(a.id)}
                    aria-pressed={action === a.id}
                    className={`rounded-xl border p-3 text-left text-sm transition ${
                      action === a.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-accent/10"
                    }`}
                  >
                    <span className="font-medium">{a.label}</span>
                    <span className="block text-xs text-muted-foreground">{a.hint}</span>
                  </button>
                ))}
              </div>

              {needsAmount && (
                <>
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
                    <label htmlFor="token-amount" className="text-sm font-medium">
                      {mode === "value" ? "Amount (KES)" : "Units"}
                    </label>
                    <input
                      id="token-amount"
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      aria-invalid={!!amountError}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                      placeholder={mode === "value" ? "500" : "20"}
                    />
                    {amountError ? (
                      <p className="text-xs text-destructive">{amountError}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        ≈ {units.toFixed(2)} units · KES {value.toFixed(2)}
                      </p>
                    )}
                  </div>
                </>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <label htmlFor="token-ref" className="text-sm font-medium">
                    Transaction ID (optional)
                  </label>
                  <input
                    id="token-ref"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="M-Pesa or internal reference"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-sm font-medium">Transaction time</span>
                  <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                    {new Date().toLocaleString()}
                  </p>
                </div>
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
                  Send token to customer by SMS
                </label>
                {sendSms && (
                  <div className="space-y-1">
                    <label htmlFor="token-phone" className="text-sm font-medium">
                      Phone number
                    </label>
                    <input
                      id="token-phone"
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
                <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
                  This meter is {meter.status}. Activate it before issuing tokens.
                </p>
              )}

              <button
                type="button"
                onClick={generate}
                disabled={!canGenerate}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                <Zap className="size-4" /> Generate and Display Token
              </button>
            </fieldset>

            {token && (
              <div className="mt-5 rounded-xl border border-primary/40 bg-primary/5 p-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  {ACTIONS.find((a) => a.id === action)?.label} token
                </p>
                <p className="mt-1 font-mono text-xl font-bold tracking-wider">{token.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {needsAmount
                    ? `${token.units.toFixed(2)} units · KES ${token.amount.toFixed(2)} · `
                    : ""}
                  {new Date(token.issuedAt).toLocaleString()}
                  {reference ? ` · Ref ${reference}` : ""}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(token.value.replace(/-/g, ""));
                    toast.success("Token copied");
                  }}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent/10"
                >
                  <Copy className="size-3.5" /> Copy token
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
    </PortalLayout>
  );
}
