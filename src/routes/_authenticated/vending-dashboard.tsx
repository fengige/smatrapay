import { formatUnits } from "@/lib/token-units";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

import { PortalLayout } from "@/components/PortalLayout";
import {
  getVendingPerformance,
  type VendingPerformanceSummary,
} from "@/lib/vending-performance.functions";

export const Route = createFileRoute("/_authenticated/vending-dashboard")({
  head: () => ({
    meta: [
      { title: "Vending Performance | SmatraPay Admin" },
      {
        name: "description",
        content: "Tokens generated per vending software and per meter, with failed vending attempts.",
      },
      { property: "og:title", content: "Vending Performance | SmatraPay Admin" },
      {
        property: "og:description",
        content: "Tokens generated per vending software and per meter, with failed vending attempts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VendingDashboardPage,
});

const kes = (n: number) =>
  `KES ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const units = (n: number) => `${formatUnits(n)} units`;

const PERIODS: [VendingPeriod, string][] = [
  ["7d", "Last 7 days"],
  ["30d", "Last 30 days"],
  ["90d", "Last 90 days"],
  ["all", "All time"],
];
type VendingPeriod = "7d" | "30d" | "90d" | "all";

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}

function VendingDashboardPage() {
  const [period, setPeriod] = useState<VendingPeriod>("30d");
  const perf = useServerFn(getVendingPerformance);

  const { data, isLoading, isFetching, refetch, isError, error } = useQuery({
    queryKey: ["vending-performance", period],
    queryFn: () => perf({ data: { period } }),
  });

  const s: VendingPerformanceSummary | undefined = data;
  const successRate =
    s && s.total_tokens + s.total_failed_attempts > 0
      ? (s.total_tokens / (s.total_tokens + s.total_failed_attempts)) * 100
      : null;

  return (
    <PortalLayout
      roles={["admin"]}
      title="Vending Performance"
      description="Tokens generated per vending software and per meter, with failed vending attempts"
      actions={
        <button type="button" onClick={() => refetch()}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium hover:bg-accent/10">
          <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </button>
      }
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {PERIODS.map(([k, l]) => (
          <button key={k} type="button" onClick={() => setPeriod(k)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${period === k ? "bg-primary text-primary-foreground" : "border border-border bg-background"}`}>
            {l}
          </button>
        ))}
      </div>

      {isError && (
        <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          Could not load vending performance{(error as Error)?.message ? `: ${(error as Error).message}` : ""}.
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Tokens generated" value={s ? s.total_tokens.toLocaleString() : "—"} />
        <StatCard label="Units vended" value={s ? units(s.total_units) : "—"} />
        <StatCard label="Value vended" value={s ? kes(s.total_amount) : "—"} />
        <StatCard label="Failed attempts" value={s ? s.total_failed_attempts.toLocaleString() : "—"} />
        <StatCard label="Vend success rate" value={successRate == null ? "—" : `${successRate.toFixed(1)}%`} />
      </div>

      <section className="mb-6 overflow-hidden rounded-2xl border border-border bg-card">
        <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">Tokens per vending software</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-sm">
            <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Vending software</th>
                <th className="px-4 py-3 text-right">Tokens</th>
                <th className="px-4 py-3 text-right">Units</th>
                <th className="px-4 py-3 text-right">Value</th>
                <th className="px-4 py-3 text-right">Failed attempts</th>
                <th className="px-4 py-3 text-right">Success rate</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={6} className="px-4 py-10 text-center"><Loader2 className="mx-auto size-5 animate-spin" /></td></tr>
              )}
              {!isLoading && s?.softwares.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No tokens generated in this period.</td></tr>
              )}
              {s?.softwares.map((sw) => {
                const rate = sw.tokens + sw.failed_attempts > 0
                  ? (sw.tokens / (sw.tokens + sw.failed_attempts)) * 100
                  : null;
                return (
                  <tr key={sw.software_id ?? "unassigned"} className="border-t border-border/60">
                    <td className="px-4 py-3 font-medium">{sw.software_name}</td>
                    <td className="px-4 py-3 text-right">{sw.tokens.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">{formatUnits(sw.units)}</td>
                    <td className="px-4 py-3 text-right">{kes(sw.amount)}</td>
                    <td className={`px-4 py-3 text-right ${sw.failed_attempts > 0 ? "text-destructive" : ""}`}>{sw.failed_attempts.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">{rate == null ? "—" : `${rate.toFixed(1)}%`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {s?.softwares.some((sw) => sw.failures.length > 0) && (
          <div className="border-t border-border px-4 py-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Failure detail by software</div>
            <ul className="space-y-1 text-sm">
              {s.softwares.filter((sw) => sw.failures.length > 0).map((sw) => (
                <li key={sw.software_id ?? "unassigned"}>
                  <span className="font-medium">{sw.software_name}:</span>{" "}
                  {sw.failures.map((f) => `${f.operation} · ${f.error_code} × ${f.count}`).join(", ")}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="mb-6 overflow-hidden rounded-2xl border border-border bg-card">
        <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">Tokens per meter</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Meter</th>
                <th className="px-4 py-3">Vending software</th>
                <th className="px-4 py-3 text-right">Tokens</th>
                <th className="px-4 py-3 text-right">Units</th>
                <th className="px-4 py-3 text-right">Value</th>
                <th className="px-4 py-3 text-right">Failed attempts</th>
                <th className="px-4 py-3">Last attempt</th>
              </tr>
            </thead>
            <tbody>
              {!isLoading && s?.meters.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No vending activity on any meter in this period.</td></tr>
              )}
              {s?.meters.map((m) => (
                <tr key={m.meter_id} className="border-t border-border/60">
                  <td className="px-4 py-3 font-medium">{m.meter_number}</td>
                  <td className="px-4 py-3">{m.software_name}</td>
                  <td className="px-4 py-3 text-right">{m.tokens.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">{formatUnits(m.units)}</td>
                  <td className="px-4 py-3 text-right">{kes(m.amount)}</td>
                  <td className={`px-4 py-3 text-right ${m.failed_attempts > 0 ? "text-destructive" : ""}`}>{m.failed_attempts.toLocaleString()}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {m.last_attempt_at ? new Date(m.last_attempt_at).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">Failed attempts breakdown</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Operation</th>
                <th className="px-4 py-3">Error</th>
                <th className="px-4 py-3 text-right">Count</th>
              </tr>
            </thead>
            <tbody>
              {!isLoading && s?.failure_breakdown.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-10 text-center text-muted-foreground">No failed vending attempts in this period.</td></tr>
              )}
              {s?.failure_breakdown.map((f, i) => (
                <tr key={`${f.operation}-${f.error_code}-${i}`} className="border-t border-border/60">
                  <td className="px-4 py-3 font-medium">{f.operation}</td>
                  <td className="px-4 py-3">{f.error_code}</td>
                  <td className="px-4 py-3 text-right">{f.count.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </PortalLayout>
  );
}
