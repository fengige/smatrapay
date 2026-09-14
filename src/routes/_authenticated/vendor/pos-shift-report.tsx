import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Download, Loader2, Receipt, Wallet } from "lucide-react";
import { PortalLayout } from "@/components/PortalLayout";
import { listVendorPosSales, type VendorPosToken } from "@/lib/vendor-pos.functions";

export const Route = createFileRoute("/_authenticated/vendor/pos-shift-report")({
  head: () => ({
    meta: [
      { title: "POS Shift Report — SmatraPay Vendor" },
      {
        name: "description",
        content:
          "Summarise your SmatraPay counter sales by payment method for any date range and export the shift totals as CSV.",
      },
      { property: "og:title", content: "POS Shift Report — SmatraPay Vendor" },
      {
        property: "og:description",
        content: "Shift totals by payment method, cashier breakdown and CSV export for vendor POS sales.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VendorShiftReportPage,
});

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  mpesa: "M-Pesa",
  card: "Card",
  bank: "Bank transfer",
  other: "Other",
};

const today = () => new Date().toISOString().slice(0, 10);

function money(n: number) {
  return `KES ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function VendorShiftReportPage() {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [method, setMethod] = useState("all");
  const [cashier, setCashier] = useState("all");

  const fetchSales = useServerFn(listVendorPosSales);
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["vendor-pos-sales", from, to],
    queryFn: async () => (await fetchSales({ data: { from, to } } as never)) as VendorPosToken[],
  });

  const sales = data ?? [];
  const cashiers = useMemo(() => [...new Set(sales.map((s) => s.cashier))].sort(), [sales]);

  const rows = useMemo(
    () =>
      sales.filter(
        (s) => (method === "all" || s.method === method) && (cashier === "all" || s.cashier === cashier),
      ),
    [sales, method, cashier],
  );

  const active = rows.filter((r) => r.status !== "revoked");
  const byMethod = useMemo(() => {
    const map = new Map<string, { count: number; amount: number; units: number }>();
    for (const r of active) {
      const cur = map.get(r.method) ?? { count: 0, amount: 0, units: 0 };
      cur.count += 1;
      cur.amount += r.amount;
      cur.units += r.units;
      map.set(r.method, cur);
    }
    return [...map.entries()].sort((a, b) => b[1].amount - a[1].amount);
  }, [active]);

  const totalAmount = active.reduce((s, r) => s + r.amount, 0);
  const totalUnits = active.reduce((s, r) => s + r.units, 0);
  const revoked = rows.filter((r) => r.status === "revoked");

  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines: string[] = [];
    lines.push([`Vendor POS shift report ${from} to ${to}`].map(esc).join(","));
    lines.push("");
    lines.push(["Payment method", "Sales", "Units", "Amount"].map(esc).join(","));
    for (const [m, t] of byMethod) {
      lines.push(
        [METHOD_LABEL[m] ?? m, t.count, t.units.toFixed(2), t.amount.toFixed(2)].map(esc).join(","),
      );
    }
    lines.push(["Total", active.length, totalUnits.toFixed(2), totalAmount.toFixed(2)].map(esc).join(","));
    lines.push("");
    lines.push(["Transactions"].map(esc).join(","));
    lines.push(
      ["When", "Meter", "Token", "Units", "Amount", "Method", "Reference", "Cashier", "Status"]
        .map(esc)
        .join(","),
    );
    for (const r of rows) {
      lines.push(
        [
          new Date(r.created_at).toLocaleString(),
          r.meter_number,
          r.token,
          r.units.toFixed(2),
          r.amount.toFixed(2),
          METHOD_LABEL[r.method] ?? r.method,
          r.reference ?? "",
          r.cashier,
          r.status,
        ]
          .map(esc)
          .join(","),
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vendor-pos-shift-report-${from}_to_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} sale(s)`);
  };

  return (
    <PortalLayout
      roles={["vendor"]}
      title="POS Shift Report"
      description="Sales totals by payment method for the selected date range"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/vendor/pos"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium hover:bg-accent/10"
          >
            <ArrowLeft className="size-4" /> Back to POS
          </Link>
          <button
            type="button"
            onClick={exportCsv}
            disabled={rows.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            <Download className="size-4" /> Export CSV
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        <section className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-4">
          <div className="space-y-1">
            <label htmlFor="from" className="text-xs font-medium text-muted-foreground">
              From
            </label>
            <input
              id="from"
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="to" className="text-xs font-medium text-muted-foreground">
              To
            </label>
            <input
              id="to"
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="method" className="text-xs font-medium text-muted-foreground">
              Payment method
            </label>
            <select
              id="method"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="all">All methods</option>
              {Object.entries(METHOD_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="cashier" className="text-xs font-medium text-muted-foreground">
              Cashier
            </label>
            <select
              id="cashier"
              value={cashier}
              onChange={(e) => setCashier(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="all">All cashiers</option>
              {cashiers.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          {[
            { label: "Sales", value: String(active.length), icon: Receipt },
            { label: "Units sold", value: totalUnits.toFixed(2), icon: Receipt },
            { label: "Total collected", value: money(totalAmount), icon: Wallet },
          ].map((k) => (
            <div key={k.label} className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs uppercase text-muted-foreground">{k.label}</p>
              <p className="mt-1 text-2xl font-bold">{k.value}</p>
            </div>
          ))}
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-bold">Totals by payment method</h2>
          {isLoading ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading sales…
            </p>
          ) : byMethod.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No sales in this range.</p>
          ) : (
            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4">Method</th>
                  <th className="py-2 pr-4">Sales</th>
                  <th className="py-2 pr-4">Units</th>
                  <th className="py-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {byMethod.map(([m, t]) => (
                  <tr key={m} className="border-t border-border">
                    <td className="py-2 pr-4 font-medium">{METHOD_LABEL[m] ?? m}</td>
                    <td className="py-2 pr-4">{t.count}</td>
                    <td className="py-2 pr-4">{t.units.toFixed(2)}</td>
                    <td className="py-2">{money(t.amount)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-border font-semibold">
                  <td className="py-2 pr-4">Total</td>
                  <td className="py-2 pr-4">{active.length}</td>
                  <td className="py-2 pr-4">{totalUnits.toFixed(2)}</td>
                  <td className="py-2">{money(totalAmount)}</td>
                </tr>
              </tbody>
            </table>
          )}
          {revoked.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              {revoked.length} revoked sale(s) excluded from totals.
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-sm font-bold">
            Transactions {isFetching && <span className="text-muted-foreground">· refreshing…</span>}
          </h2>
          {rows.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No transactions to show.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4">When</th>
                    <th className="py-2 pr-4">Meter</th>
                    <th className="py-2 pr-4">Token</th>
                    <th className="py-2 pr-4">Units</th>
                    <th className="py-2 pr-4">Amount</th>
                    <th className="py-2 pr-4">Method</th>
                    <th className="py-2 pr-4">Cashier</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="py-2 pr-4">{new Date(r.created_at).toLocaleString()}</td>
                      <td className="py-2 pr-4">{r.meter_number}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{r.token}</td>
                      <td className="py-2 pr-4">{r.units.toFixed(2)}</td>
                      <td className="py-2 pr-4">{money(r.amount)}</td>
                      <td className="py-2 pr-4">{METHOD_LABEL[r.method] ?? r.method}</td>
                      <td className="py-2 pr-4">{r.cashier}</td>
                      <td className="py-2 capitalize">{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </PortalLayout>
  );
}
