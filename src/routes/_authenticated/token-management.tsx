import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Ban,
  Copy,
  Gauge,
  KeyRound,
  Loader2,
  MessageSquare,
  Search,
  Zap,
} from "lucide-react";
import { PortalLayout } from "@/components/PortalLayout";
import {
  issueMeterToken,
  listMeterTokens,
  revokeMeterToken,
  searchTokenMeters,
  type IssuedToken,
  type TokenAction,
  type TokenMeterMatch,
} from "@/lib/tokens.functions";

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

const ACTIONS: { id: TokenAction; label: string; hint: string }[] = [
  { id: "credit", label: "Issue Credit", hint: "Vend units or value onto the meter" },
  { id: "key_change", label: "Key Change", hint: "Rotate the meter supply group key" },
  {
    id: "set_max_overdraft",
    label: "Set Max Overdraft",
    hint: "Set the maximum overdraft limit on the meter",
  },
  { id: "clear_tamper", label: "Clear Tamper", hint: "Reset a tamper condition" },
  { id: "clear_credit", label: "Clear Credit", hint: "Zero the meter credit balance" },
];

const ACTION_LABEL: Record<TokenAction, string> = {
  credit: "Issue Credit",
  key_change: "Key Change",
  set_max_overdraft: "Set Max Overdraft",
  clear_tamper: "Clear Tamper",
  clear_credit: "Clear Credit",
};

function StatusBadge({ status }: { status: IssuedToken["status"] }) {
  const tone =
    status === "issued"
      ? "bg-emerald-500/15 text-emerald-600"
      : status === "expired"
        ? "bg-amber-500/15 text-amber-600"
        : "bg-destructive/15 text-destructive";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${tone}`}>
      {status}
    </span>
  );
}

function TokenManagementPage() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TokenMeterMatch[] | null>(null);
  const [meter, setMeter] = useState<TokenMeterMatch | null>(null);

  const [action, setAction] = useState<TokenAction>("credit");
  const [mode, setMode] = useState<"value" | "units">("value");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [expiryDays, setExpiryDays] = useState("30");
  const [sendSms, setSendSms] = useState(false);
  const [phone, setPhone] = useState("");
  const [maxOverdraft, setMaxOverdraft] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [token, setToken] = useState<IssuedToken | null>(null);
  const [revoking, setRevoking] = useState<IssuedToken | null>(null);
  const [revokeReason, setRevokeReason] = useState("");

  const runSearch = useServerFn(searchTokenMeters);
  const runIssue = useServerFn(issueMeterToken);
  const runRevoke = useServerFn(revokeMeterToken);
  const runList = useServerFn(listMeterTokens);

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

  const history = useQuery({
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
      ? "Amount is required"
      : !Number.isFinite(amountNumber) || amountNumber <= 0
        ? "Enter an amount greater than zero"
        : mode === "value" && rate <= 0
          ? "This meter has no price per unit configured"
          : null;
  const phoneError = sendSms && phone.trim().length < 7 ? "Enter a valid phone number" : null;
  const expiryNumber = Number(expiryDays);
  const expiryError =
    !Number.isInteger(expiryNumber) || expiryNumber < 1 || expiryNumber > 365
      ? "Expiry must be between 1 and 365 days"
      : null;
  const needsAmount = action === "credit";
  const needsOverdraft = action === "set_max_overdraft";
  const overdraftNumber = Number(maxOverdraft);
  const overdraftError = needsOverdraft
    ? maxOverdraft.trim() === ""
      ? "Max overdraft is required"
      : !Number.isFinite(overdraftNumber) || overdraftNumber <= 0
        ? "Enter an overdraft limit greater than zero"
        : null
    : null;
  const canGenerate =
    !!meter &&
    (!needsAmount || !amountError) &&
    !overdraftError &&
    !phoneError &&
    !expiryError &&
    meter.status === "active";

  const issue = useMutation({
    mutationFn: async () =>
      (await runIssue({
        data: {
          meter_id: meter!.id,
          action,
          units: needsAmount
            ? Number(units.toFixed(2))
            : needsOverdraft
              ? Number(overdraftNumber.toFixed(2))
              : 0,
          amount: needsAmount ? Number(value.toFixed(2)) : 0,
          reference: reference.trim() || null,
          customer_phone: sendSms ? phone.trim() : null,
          sms_requested: sendSms,
          expires_in_days: expiryNumber,
        },
      } as never)) as IssuedToken,
    onSuccess: (issued) => {
      setToken(issued);
      setConfirming(false);
      toast.success("Token issued");
      if (issued.sms_requested)
        toast.info(`Token queued for SMS delivery to ${issued.customer_phone}`);
      void queryClient.invalidateQueries({ queryKey: ["meter-tokens"] });
    },
    onError: (err: Error) => toast.error(err.message || "Could not issue token"),
  });

  const revoke = useMutation({
    mutationFn: async () =>
      (await runRevoke({
        data: { id: revoking!.id, reason: revokeReason.trim() || null },
      } as never)) as IssuedToken,
    onSuccess: (updated) => {
      toast.success("Token revoked");
      setRevoking(null);
      setRevokeReason("");
      if (token?.id === updated.id) setToken(updated);
      void queryClient.invalidateQueries({ queryKey: ["meter-tokens"] });
    },
    onError: (err: Error) => toast.error(err.message || "Could not revoke token"),
  });

  return (
    <PortalLayout
      roles={["admin"]}
      title="Token Management"
      description="Search a prepaid meter, then issue credit or an engineering token for the customer"
    >
      <div className="space-y-6">
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

              {needsOverdraft && (
                <div className="space-y-1">
                  <label htmlFor="token-overdraft" className="text-sm font-medium">
                    Max Overdraft
                  </label>
                  <input
                    id="token-overdraft"
                    inputMode="decimal"
                    value={maxOverdraft}
                    onChange={(e) => setMaxOverdraft(e.target.value)}
                    aria-invalid={!!overdraftError}
                    placeholder="e.g. 100"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  {overdraftError ? (
                    <p className="text-xs text-destructive">{overdraftError}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      The maximum overdraft limit the token will set on the meter.
                    </p>
                  )}
                </div>
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
                  <label htmlFor="token-expiry" className="text-sm font-medium">
                    Token expiry (days)
                  </label>
                  <input
                    id="token-expiry"
                    inputMode="numeric"
                    value={expiryDays}
                    onChange={(e) => setExpiryDays(e.target.value)}
                    aria-invalid={!!expiryError}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  {expiryError && <p className="text-xs text-destructive">{expiryError}</p>}
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
                onClick={() => setConfirming(true)}
                disabled={!canGenerate}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                <Zap className="size-4" /> Generate and Display Token
              </button>
            </fieldset>

            {token && (
              <div className="mt-5 rounded-xl border border-primary/40 bg-primary/5 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-medium uppercase text-muted-foreground">
                    {ACTION_LABEL[token.action]} token
                  </p>
                  <StatusBadge status={token.status} />
                </div>
                <p className="mt-1 font-mono text-xl font-bold tracking-wider">{token.token}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {token.action === "credit"
                    ? `${token.units.toFixed(2)} units · KES ${token.amount.toFixed(2)} · `
                    : token.action === "set_max_overdraft"
                      ? `Max overdraft ${token.units.toFixed(2)} · `
                      : ""}
                  {new Date(token.created_at).toLocaleString()}
                  {token.reference ? ` · Ref ${token.reference}` : ""} · Expires{" "}
                  {new Date(token.expires_at).toLocaleString()}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(token.token.replace(/-/g, ""));
                      toast.success("Token copied");
                    }}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent/10"
                  >
                    <Copy className="size-3.5" /> Copy token
                  </button>
                  {token.status === "issued" && (
                    <button
                      type="button"
                      onClick={() => setRevoking(token)}
                      className="inline-flex items-center gap-2 rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
                    >
                      <Ban className="size-3.5" /> Revoke token
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Token history */}
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-semibold">
            {meter ? `Tokens for ${meter.meter_number}` : "Recently issued tokens"}
          </h2>
          {history.isLoading ? (
            <p className="mt-3 text-sm text-muted-foreground">Loading tokens…</p>
          ) : !history.data?.length ? (
            <p className="mt-3 text-sm text-muted-foreground">No tokens issued yet.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2 pr-4">Token</th>
                    <th className="py-2 pr-4">Meter</th>
                    <th className="py-2 pr-4">Action</th>
                    <th className="py-2 pr-4">Value</th>
                    <th className="py-2 pr-4">Issued</th>
                    <th className="py-2 pr-4">Expires</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {history.data.map((t) => (
                    <tr key={t.id} className="border-b border-border/60">
                      <td className="py-2 pr-4 font-mono text-xs">{t.token}</td>
                      <td className="py-2 pr-4">{t.meter_number}</td>
                      <td className="py-2 pr-4">{ACTION_LABEL[t.action]}</td>
                      <td className="py-2 pr-4">
                        {t.action === "credit"
                          ? `${t.units.toFixed(2)} u · KES ${t.amount.toFixed(2)}`
                          : "—"}
                      </td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">
                        {new Date(t.created_at).toLocaleString()}
                        {t.issued_by_name ? ` · ${t.issued_by_name}` : ""}
                      </td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">
                        {new Date(t.expires_at).toLocaleDateString()}
                      </td>
                      <td className="py-2 pr-4">
                        <StatusBadge status={t.status} />
                        {t.revoke_reason && (
                          <span className="block text-xs text-muted-foreground">
                            {t.revoke_reason}
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        {t.status === "issued" && (
                          <button
                            type="button"
                            onClick={() => setRevoking(t)}
                            className="inline-flex items-center gap-1 rounded-lg border border-destructive/40 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
                          >
                            <Ban className="size-3" /> Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Issue confirmation */}
      {confirming && meter && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-token-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-lg">
            <h3 id="confirm-token-title" className="font-semibold">
              Confirm token issuance
            </h3>
            <dl className="mt-4 space-y-2 rounded-xl border border-border bg-muted/30 p-4 text-sm">
              {[
                ["Meter", meter.meter_number],
                ["Customer", meter.customer_name ?? "Unassigned"],
                ["Action", ACTION_LABEL[action]],
                ...(needsAmount
                  ? ([
                      ["Units", units.toFixed(2)],
                      ["Amount", `KES ${value.toFixed(2)}`],
                    ] as [string, string][])
                  : []),
                ["Expires in", `${expiryNumber} day(s)`],
                ["Reference", reference.trim() || "—"],
                ["SMS", sendSms ? phone.trim() : "Not sending"],
              ].map(([label, val]) => (
                <div key={label} className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="text-right font-medium">{val}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent/10"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => issue.mutate()}
                disabled={issue.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {issue.isPending && <Loader2 className="size-4 animate-spin" />}
                Confirm and issue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revoke confirmation */}
      {revoking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="revoke-token-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-lg">
            <h3 id="revoke-token-title" className="font-semibold">
              Revoke this token?
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Token <span className="font-mono">{revoking.token}</span> for meter{" "}
              {revoking.meter_number} will be marked as revoked and can no longer be used.
            </p>
            <div className="mt-4 space-y-1">
              <label htmlFor="revoke-reason" className="text-sm font-medium">
                Reason (optional)
              </label>
              <input
                id="revoke-reason"
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                placeholder="e.g. issued in error"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setRevoking(null);
                  setRevokeReason("");
                }}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => revoke.mutate()}
                disabled={revoke.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-60"
              >
                {revoke.isPending && <Loader2 className="size-4 animate-spin" />}
                Revoke token
              </button>
            </div>
          </div>
        </div>
      )}
    </PortalLayout>
  );
}
