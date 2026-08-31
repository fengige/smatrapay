import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Activity, Coins, Download, Gauge, RefreshCw, Search } from "lucide-react";

import { getTokenLedger, type LedgerHolderKind } from "@/lib/token-ledger.functions";
import { PortalLayout } from "@/components/PortalLayout";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";

export const Route = createFileRoute("/_authenticated/token-ledger")({
  head: () => ({
    meta: [
      { title: "Token Ledger · SmatraPay" },
      {
        name: "description",
        content:
          "Every token transaction with meter units, readings and amounts, grouped by agent, vendor and landlord.",
      },
      { property: "og:title", content: "Token Ledger · SmatraPay" },
      {
        property: "og:description",
        content: "Meter token transactions, units, readings and revenue per agent, vendor and landlord.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TokenLedgerPage,
  errorComponent: ({ error }) => (
    <div className="p-10 text-sm text-destructive">{error.message}</div>
  ),
});

const RANGES = [7, 30, 90];

const KIND_TONE: Record<string, string> = {
  agent: "bg-sky-500/12 text-sky-600",
  vendor: "bg-violet-500/12 text-violet-600",
  landlord: "bg-emerald-500/12 text-emerald-600",
};

const DETAIL_ROUTE = {
  agent: "/agents/$id",
  vendor: "/vendors/$id",
  landlord: "/landlords/$id",
} as const;

function number(value: number, digits = 0) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const max = Math.max(1, ...values);
  return (
    <div className={`flex h-8 items-end gap-[2px] ${className ?? ""}`} aria-hidden="true">
      {values.map((v, i) => (
        <span
          key={i}
          className="w-full min-w-[2px] rounded-sm bg-primary/70"
          style={{ height: `${Math.max(4, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

function HolderBadge({ kind, id, name }: { kind: LedgerHolderKind; id: string; name: string }) {
  return (
    <Link
      to={DETAIL_ROUTE[kind]}
      params={{ id }}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${KIND_TONE[kind]}`}
    >
      {kind}: {name}
    </Link>
  );
}

function TokenLedgerPage() {
  const fetchLedger = useServerFn(getTokenLedger);
  const [days, setDays] = useState(30);
  const [kind, setKind] = useState<"all" | LedgerHolderKind>("all");
  const [holderId, setHolderId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [includeRevoked, setIncludeRevoked] = useState(false);

  const query = useQuery({
    queryKey: ["token-ledger", days, kind, holderId, q, includeRevoked],
    queryFn: () =>
      fetchLedger({ data: { days, kind, holderId, q, includeRevoked } }),
    refetchInterval: 30000,
    placeholderData: (prev) => prev,
  });

  useRealtimeRefresh("token-ledger", ["meters", "meter_tokens"], [["token-ledger"]]);

  const data = query.data;
  const totals = data?.totals;

  const exportCsv = () => {
    const rows = data?.entries ?? [];
    const header = [
      "date",
      "meter_number",
      "meter_type",
      "action",
      "status",
      "units",
      "amount",
      "reading",
      "holders",
    ];
    const body = rows.map((e) =>
      [
        new Date(e.created_at).toISOString(),
        e.meter_number,
        e.meter_type,
        e.action,
        e.status,
        e.units,
        e.amount,
        e.reading,
        e.holders.map((h) => `${h.kind}:${h.name}`).join(" | "),
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...body].join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `token-ledger-${days}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PortalLayout
      roles={["admin"]}
      title="Token Ledger"
      description="Token transactions, units and meter readings per agent, vendor and landlord"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-border p-0.5">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setDays(r)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                  days === r ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                {r}d
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3.5 py-2 text-sm font-semibold hover:bg-muted"
          >
            <Download className="size-4" /> Export CSV
          </button>
          <button
            type="button"
            onClick={() => query.refetch()}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3.5 py-2 text-sm font-semibold hover:bg-muted"
          >
            <RefreshCw className={`size-4 ${query.isFetching ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Transactions", value: number(totals?.transactions ?? 0), icon: Activity },
            { label: `Units vended (${days}d)`, value: number(totals?.units ?? 0, 2), icon: Gauge },
            { label: "Amount", value: number(totals?.amount ?? 0, 2), icon: Coins },
            { label: "Meters transacting", value: number(totals?.meters ?? 0), icon: Gauge },
          ].map((card) => (
            <div key={card.label} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {card.label}
                </p>
                <card.icon className="size-4 text-muted-foreground" />
              </div>
              <p className="mt-2 text-2xl font-bold text-foreground">{card.value}</p>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm font-semibold text-foreground">Units vended</p>
          <p className="text-xs text-muted-foreground">Daily totals over the last {days} days</p>
          <Sparkline values={data?.globalTrend ?? []} className="mt-4 h-16" />
        </div>

        <div className="rounded-2xl border border-border bg-card">
          <div className="border-b border-border p-4">
            <p className="text-sm font-semibold text-foreground">Revenue by meter type</p>
            <p className="text-xs text-muted-foreground">
              Unit type, average price per unit and revenue over the last {days} days
            </p>
          </div>
          {(data?.revenueByType ?? []).length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No token transactions in this window.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="p-3 text-left">Unit type</th>
                    <th className="p-3 text-right">Meters</th>
                    <th className="p-3 text-right">Transactions</th>
                    <th className="p-3 text-right">Avg price / unit</th>
                    <th className="p-3 text-right">Units</th>
                    <th className="p-3 text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.revenueByType ?? []).map((r) => (
                    <tr key={r.type} className="border-t border-border">
                      <td className="p-3 font-medium capitalize text-foreground">{r.type}</td>
                      <td className="p-3 text-right">{number(r.meters)}</td>
                      <td className="p-3 text-right">{number(r.transactions)}</td>
                      <td className="p-3 text-right">{number(r.avgPricePerUnit, 2)}</td>
                      <td className="p-3 text-right">{number(r.units, 2)}</td>
                      <td className="p-3 text-right font-semibold text-foreground">
                        {number(r.amount, 2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card">
          <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
            <div className="relative min-w-56 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search meter number or holder"
                aria-label="Search ledger"
                className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm"
              />
            </div>
            <div className="inline-flex rounded-lg border border-border p-0.5">
              {(["all", "agent", "vendor", "landlord"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setKind(k);
                    setHolderId(null);
                  }}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize ${
                    kind === k ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <input
                type="checkbox"
                checked={includeRevoked}
                onChange={(e) => setIncludeRevoked(e.target.checked)}
              />
              Include revoked
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <caption className="sr-only">Holder totals</caption>
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-3 text-left">Holder</th>
                  <th className="p-3 text-left">Type</th>
                  <th className="p-3 text-right">Meters</th>
                  <th className="p-3 text-right">Tokens</th>
                  <th className="p-3 text-right">Units</th>
                  <th className="p-3 text-right">Amount</th>
                  <th className="p-3 text-left">Trend</th>
                </tr>
              </thead>
              <tbody>
                {(data?.holders ?? []).map((h) => (
                  <tr
                    key={`${h.kind}:${h.id}`}
                    className={`border-t border-border ${holderId === h.id ? "bg-muted/40" : ""}`}
                  >
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => setHolderId(holderId === h.id ? null : h.id)}
                        className="font-semibold text-foreground hover:underline"
                      >
                        {h.name}
                      </button>
                      <p className="text-xs text-muted-foreground">{h.email ?? "—"}</p>
                    </td>
                    <td className="p-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${KIND_TONE[h.kind]}`}
                      >
                        {h.kind}
                      </span>
                    </td>
                    <td className="p-3 text-right">{number(h.meters)}</td>
                    <td className="p-3 text-right">{number(h.tokens)}</td>
                    <td className="p-3 text-right">{number(h.units, 2)}</td>
                    <td className="p-3 text-right">{number(h.amount, 2)}</td>
                    <td className="p-3">
                      <Sparkline values={h.trend} className="w-32" />
                    </td>
                  </tr>
                ))}
                {!query.isLoading && !(data?.holders ?? []).length && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-sm text-muted-foreground">
                      No token activity in this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border p-4">
            <p className="text-sm font-semibold text-foreground">Transactions</p>
            {holderId && (
              <button
                type="button"
                onClick={() => setHolderId(null)}
                className="text-xs font-semibold text-primary hover:underline"
              >
                Clear holder filter
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <caption className="sr-only">Token transactions</caption>
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="p-3 text-left">Date</th>
                  <th className="p-3 text-left">Meter</th>
                  <th className="p-3 text-left">Action</th>
                  <th className="p-3 text-left">Status</th>
                  <th className="p-3 text-right">Units</th>
                  <th className="p-3 text-right">Amount</th>
                  <th className="p-3 text-right">Reading</th>
                  <th className="p-3 text-left">Holders</th>
                </tr>
              </thead>
              <tbody>
                {(data?.entries ?? []).map((e) => (
                  <tr key={e.id} className="border-t border-border">
                    <td className="p-3 whitespace-nowrap text-muted-foreground">
                      {new Date(e.created_at).toLocaleString()}
                    </td>
                    <td className="p-3">
                      <Link
                        to="/meters/$meterId"
                        params={{ meterId: e.meter_id }}
                        className="font-semibold text-foreground hover:underline"
                      >
                        {e.meter_number}
                      </Link>
                      <p className="text-xs capitalize text-muted-foreground">
                        {e.meter_type || "—"} · {number(e.price_per_unit, 2)}/unit
                      </p>
                    </td>
                    <td className="p-3 capitalize">{e.action.replace(/_/g, " ")}</td>
                    <td className="p-3 capitalize">{e.status}</td>
                    <td className="p-3 text-right">{number(e.units, 2)}</td>
                    <td className="p-3 text-right">{number(e.amount, 2)}</td>
                    <td className="p-3 text-right">{number(e.reading, 2)}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {e.holders.length ? (
                          e.holders.map((h) => (
                            <HolderBadge key={`${h.kind}:${h.id}`} kind={h.kind} id={h.id} name={h.name} />
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground">Unassigned</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!query.isLoading && !(data?.entries ?? []).length && (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-sm text-muted-foreground">
                      No transactions match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {data?.truncated && (
            <p className="border-t border-border p-3 text-xs text-muted-foreground">
              Showing the most recent {data.entries.length} of {totals?.transactions} transactions.
            </p>
          )}
        </div>
      </div>
    </PortalLayout>
  );
}
