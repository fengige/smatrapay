import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  Activity,
  ChevronDown,
  ChevronRight,
  Gauge,
  RefreshCw,
  Search,
  Zap,
} from "lucide-react";

import { getMeterDashboard, type HolderMeterSummary } from "@/lib/meter-dashboard.functions";
import { PortalLayout } from "@/components/PortalLayout";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";

export const Route = createFileRoute("/_authenticated/meter-dashboard")({
  head: () => ({
    meta: [
      { title: "Meter Dashboard · SmatraPay" },
      {
        name: "description",
        content:
          "Track assigned meters, statuses and usage trends for every agent, vendor and landlord in one live dashboard.",
      },
      { property: "og:title", content: "Meter Dashboard · SmatraPay" },
      {
        property: "og:description",
        content: "Live meter portfolios, statuses and consumption trends per agent, vendor and landlord.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MeterDashboardPage,
  errorComponent: ({ error }) => (
    <div className="p-10 text-sm text-destructive">{error.message}</div>
  ),
});

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

const RANGES = [7, 30, 90];

function number(value: number, digits = 0) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

const money = (n: number) =>
  `KES ${new Intl.NumberFormat("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;

function typeLabel(type: string) {
  return type ? type.charAt(0).toUpperCase() + type.slice(1) : "Unknown";
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

function MeterDashboardPage() {
  const fetchDashboard = useServerFn(getMeterDashboard);
  const [days, setDays] = useState(30);
  const [kind, setKind] = useState<"all" | "agent" | "vendor" | "landlord">("all");
  const [q, setQ] = useState("");
  const [openHolder, setOpenHolder] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["meter-dashboard", days],
    queryFn: () => fetchDashboard({ data: { days } }),
    refetchInterval: 30000,
    placeholderData: (prev) => prev,
  });

  useRealtimeRefresh(
    "meter-dashboard",
    ["meters", "meter_tokens"],
    [["meter-dashboard"]],
  );

  const data = query.data;
  const rows = useMemo(() => {
    const list = data?.rows ?? [];
    const term = q.trim().toLowerCase();
    return list.filter((r) => {
      if (kind !== "all" && r.holderKind !== kind) return false;
      if (!term) return true;
      return (
        r.name.toLowerCase().includes(term) ||
        (r.email ?? "").toLowerCase().includes(term) ||
        r.meters.some((m) => m.meter_number.toLowerCase().includes(term))
      );
    });
  }, [data, kind, q]);

  const totals = data?.totals;

  return (
    <PortalLayout
      roles={["admin"]}
      title="Meter Dashboard"
      description="Assigned meters, statuses and usage trends per agent, vendor and landlord"
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
            { label: "Total meters", value: number(totals?.meters ?? 0), icon: Gauge },
            { label: "Active meters", value: number(totals?.active ?? 0), icon: Zap },
            { label: `Units sold (${days}d)`, value: number(totals?.units ?? 0, 2), icon: Activity },
            { label: "Unassigned meters", value: number(totals?.unassigned ?? 0), icon: Gauge },
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
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Consumption trend</p>
              <p className="text-xs text-muted-foreground">
                Units vended across all meters, last {days} days
              </p>
            </div>
            <p className="text-sm font-semibold text-foreground">
              {number(totals?.tokens ?? 0)} tokens
            </p>
          </div>
          <Sparkline values={data?.globalTrend ?? []} className="mt-4 h-16" />
        </div>

        <div className="rounded-2xl border border-border bg-card">
          <div className="border-b border-border p-4">
            <p className="text-sm font-semibold text-foreground">Revenue by meter type</p>
            <p className="text-xs text-muted-foreground">
              Unit type, average price per unit and revenue vended, last {days} days
            </p>
          </div>
          {(data?.revenueByType ?? []).length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No meters registered yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">Unit type</th>
                    <th className="px-4 py-3 text-right">Meters</th>
                    <th className="px-4 py-3 text-right">Avg price / unit</th>
                    <th className="px-4 py-3 text-right">Units ({days}d)</th>
                    <th className="px-4 py-3 text-right">Revenue ({days}d)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(data?.revenueByType ?? []).map((r) => (
                    <tr key={r.type}>
                      <td className="px-4 py-3 font-medium text-foreground">{typeLabel(r.type)}</td>
                      <td className="px-4 py-3 text-right">{number(r.meters)}</td>
                      <td className="px-4 py-3 text-right">{money(r.avgPricePerUnit)}</td>
                      <td className="px-4 py-3 text-right">{number(r.units, 2)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-foreground">
                        {money(r.amount)}
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
                placeholder="Search holder, email or meter number"
                aria-label="Search holders"
                className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm"
              />
            </div>
            <div className="inline-flex rounded-lg border border-border p-0.5">
              {(["all", "agent", "vendor", "landlord"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize ${
                    kind === k ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                  }`}
                >
                  {k === "all" ? "All" : `${k}s`}
                </button>
              ))}
            </div>
          </div>

          {query.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No agents, vendors or landlords have meters assigned yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">Holder</th>
                    <th className="px-4 py-3 text-left">Role</th>
                    <th className="px-4 py-3 text-right">Meters</th>
                    <th className="px-4 py-3 text-right">Active</th>
                    <th className="px-4 py-3 text-right">On units</th>
                    <th className="px-4 py-3 text-right">Units ({days}d)</th>
                    <th className="px-4 py-3 text-left">Trend</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const key = `${row.holderKind}:${row.holderId}`;
                    const open = openHolder === key;
                    return (
                      <HolderRows
                        key={key}
                        row={row}
                        open={open}
                        days={days}
                        onToggle={() => setOpenHolder(open ? null : key)}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </PortalLayout>
  );
}

function HolderRows({
  row,
  open,
  days,
  onToggle,
}: {
  row: HolderMeterSummary;
  open: boolean;
  days: number;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="border-t border-border">
        <td className="px-4 py-3">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className="flex items-center gap-2 text-left font-semibold text-foreground hover:underline"
          >
            {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            <span>
              {row.name}
              <span className="block text-xs font-normal text-muted-foreground">
                {row.email ?? "—"}
              </span>
            </span>
          </button>
        </td>
        <td className="px-4 py-3">
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${
              KIND_TONE[row.holderKind]
            }`}
          >
            {row.holderKind}
          </span>
        </td>
        <td className="px-4 py-3 text-right font-semibold">{number(row.total)}</td>
        <td className="px-4 py-3 text-right text-emerald-600">{number(row.active)}</td>
        <td className="px-4 py-3 text-right">{number(row.assignedToUnits)}</td>
        <td className="px-4 py-3 text-right">{number(row.units, 2)}</td>
        <td className="px-4 py-3">
          <Sparkline values={row.trend} />
        </td>
        <td className="px-4 py-3 text-right">
          <Link
            to={DETAIL_ROUTE[row.holderKind]}
            params={{ id: row.holderId }}
            className="text-xs font-semibold text-primary hover:underline"
          >
            View profile
          </Link>
        </td>
      </tr>
      {open && (
        <tr className="border-t border-border bg-muted/20">
          <td colSpan={8} className="px-4 py-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Live meter readings · last {days} days
            </p>
            {row.meters.length === 0 ? (
              <p className="text-sm text-muted-foreground">No meters registered.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border bg-card">
                <table className="w-full min-w-[680px] text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Meter</th>
                      <th className="px-3 py-2 text-left">Type</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Unit</th>
                      <th className="px-3 py-2 text-right">Tokens</th>
                      <th className="px-3 py-2 text-right">Units</th>
                      <th className="px-3 py-2 text-left">Last reading</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...row.meters]
                      .sort((a, b) => b.units - a.units)
                      .map((m) => (
                        <tr key={m.id} className="border-t border-border">
                          <td className="px-3 py-2">
                            <Link
                              to="/meters/$meterId"
                              params={{ meterId: m.id }}
                              className="font-semibold text-primary hover:underline"
                            >
                              {m.meter_number}
                            </Link>
                          </td>
                          <td className="px-3 py-2 capitalize">{m.type}</td>
                          <td className="px-3 py-2">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${
                                m.status.toLowerCase() === "active"
                                  ? "bg-emerald-500/12 text-emerald-600"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {m.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {m.assigned ? "Assigned" : "—"}
                          </td>
                          <td className="px-3 py-2 text-right">{number(m.tokens)}</td>
                          <td className="px-3 py-2 text-right">{number(m.units, 2)}</td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {m.lastReadingAt
                              ? new Date(m.lastReadingAt).toLocaleString()
                              : "No activity"}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
