import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { BadgeDollarSign, Gauge, Loader2, RefreshCw, Search, TrendingUp } from "lucide-react";
import { toast } from "sonner";

import { PortalLayout } from "@/components/PortalLayout";
import { listMeters } from "@/lib/meters.functions";
import { applyPriceMode, bulkSetMeterPrice, type PriceMode } from "@/lib/prices.functions";

export const Route = createFileRoute("/_authenticated/price-management")({
  head: () => ({
    meta: [
      { title: "Price Management · SmatraPay" },
      {
        name: "description",
        content:
          "Configure meter price per unit in bulk: set a flat tariff or adjust prices by percentage or amount across selected electricity, water and gas meters.",
      },
      { property: "og:title", content: "Price Management · SmatraPay" },
      {
        property: "og:description",
        content: "Bulk tariff configuration for your electricity, water and gas meters.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PriceManagementPage,
  errorComponent: ({ error }) => (
    <div className="p-10 text-sm text-destructive">{error.message}</div>
  ),
});

const MODE_LABELS: Record<PriceMode, string> = {
  set: "Set price to",
  increase_pct: "Increase by (%)",
  decrease_pct: "Decrease by (%)",
  increase_amount: "Increase by (amount)",
  decrease_amount: "Decrease by (amount)",
};

const money = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function PriceManagementPage() {
  const queryClient = useQueryClient();
  const fetchMeters = useServerFn(listMeters);
  const applyPrices = useServerFn(bulkSetMeterPrice);

  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState<PriceMode>("set");
  const [value, setValue] = useState("");
  const [confirming, setConfirming] = useState(false);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["meters"],
    queryFn: () => fetchMeters(),
  });

  const meters = data?.meters ?? [];
  const suppliers = data?.suppliers ?? [];

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return meters.filter((m) => {
      if (typeFilter !== "all" && m.type !== typeFilter) return false;
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      if (supplierFilter !== "all" && (m.supplier_id ?? "none") !== supplierFilter) return false;
      if (!needle) return true;
      return [m.meter_number, m.serial_number, m.supplier_name ?? "", m.landlord_name ?? "", m.unit_label ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [meters, q, typeFilter, statusFilter, supplierFilter]);

  const selectedRows = rows.filter((m) => selected[m.id]);
  const numericValue = Number(value);
  const valueValid = value.trim() !== "" && Number.isFinite(numericValue) && numericValue >= 0;

  const preview = useMemo(() => {
    if (!valueValid) return [];
    return selectedRows.map((m) => ({
      id: m.id,
      meter_number: m.meter_number,
      from: m.price_per_unit,
      to: applyPriceMode(m.price_per_unit, mode, numericValue),
    }));
  }, [selectedRows, mode, numericValue, valueValid]);

  const negative = preview.some((p) => p.to < 0);
  const changing = preview.filter((p) => p.to !== p.from).length;

  const avgPrice = meters.length
    ? meters.reduce((sum, m) => sum + m.price_per_unit, 0) / meters.length
    : 0;
  const unpriced = meters.filter((m) => m.price_per_unit <= 0).length;

  const mutation = useMutation({
    mutationFn: () =>
      applyPrices({
        data: { ids: selectedRows.map((m) => m.id), mode, value: numericValue },
      } as never),
    onSuccess: async (res: any) => {
      await queryClient.invalidateQueries({ queryKey: ["meters"] });
      setConfirming(false);
      setSelected({});
      setValue("");
      toast.success(
        `Updated ${res.updated} meter${res.updated === 1 ? "" : "s"}${
          res.unchanged ? ` · ${res.unchanged} already at that price` : ""
        }`,
      );
    },
    onError: (e: Error) => toast.error(e.message || "Could not update prices"),
  });

  const allSelected = rows.length > 0 && rows.every((m) => selected[m.id]);
  const toggleAll = () => {
    if (allSelected) {
      setSelected({});
      return;
    }
    const next: Record<string, boolean> = {};
    for (const m of rows) next[m.id] = true;
    setSelected(next);
  };

  return (
    <PortalLayout
      roles={["admin"]}
      title="Price Management"
      description="Bulk meter price per unit configuration"
      actions={
        <button
          type="button"
          onClick={() => refetch()}
          aria-label="Refresh meters"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground hover:bg-accent/10"
        >
          <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Meters</span>
            <Gauge className="size-4 text-primary" />
          </div>
          <div className="mt-2 text-2xl font-bold">{meters.length}</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Average price / unit</span>
            <TrendingUp className="size-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-bold">{money(avgPrice)}</div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Missing a price</span>
            <BadgeDollarSign className="size-4 text-amber-600" />
          </div>
          <div className="mt-2 text-2xl font-bold">{unpriced}</div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-border bg-card p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
          <label className="flex items-center gap-2 rounded-xl border border-border bg-background px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search meter number, serial, supplier, landlord…"
              aria-label="Search meters"
              className="h-11 w-full bg-transparent text-sm outline-none"
            />
          </label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Filter by utility type"
            className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
          >
            <option value="all">All utilities</option>
            <option value="electricity">Electricity</option>
            <option value="water">Water</option>
            <option value="gas">Gas</option>
          </select>
          <select
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            aria-label="Filter by supplier"
            className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
          >
            <option value="all">All suppliers</option>
            <option value="none">No supplier</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
            className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        <div className="mt-4 grid gap-3 border-t border-border pt-4 md:grid-cols-[auto_auto_1fr_auto] md:items-end">
          <div>
            <label htmlFor="price-mode" className="mb-1 block text-xs font-semibold text-muted-foreground">
              Price rule
            </label>
            <select
              id="price-mode"
              value={mode}
              onChange={(e) => setMode(e.target.value as PriceMode)}
              className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
            >
              {(Object.keys(MODE_LABELS) as PriceMode[]).map((m) => (
                <option key={m} value={m}>
                  {MODE_LABELS[m]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="price-value" className="mb-1 block text-xs font-semibold text-muted-foreground">
              Value
            </label>
            <input
              id="price-value"
              type="number"
              min="0"
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0.00"
              className="h-11 w-40 rounded-xl border border-border bg-background px-3 text-sm"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {selectedRows.length === 0
              ? "Select meters below to configure their price per unit."
              : valueValid
                ? `${changing} of ${selectedRows.length} selected meter(s) will change.`
                : `${selectedRows.length} meter(s) selected — enter a value.`}
            {negative && (
              <span className="block font-semibold text-destructive">
                This rule would create a negative price. Lower the value.
              </span>
            )}
          </p>
          <button
            type="button"
            disabled={!selectedRows.length || !valueValid || negative || changing === 0}
            onClick={() => setConfirming(true)}
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <BadgeDollarSign className="size-4" /> Apply to {selectedRows.length || 0}
          </button>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] text-sm">
            <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Select all meters"
                  />
                </th>
                <th className="px-4 py-3">Meter</th>
                <th className="px-4 py-3">Utility</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Unit</th>
                <th className="px-4 py-3 text-right">Price / unit</th>
                <th className="px-4 py-3 text-right">New price</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    <Loader2 className="mx-auto size-5 animate-spin" />
                  </td>
                </tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    No meters match these filters.
                  </td>
                </tr>
              )}
              {rows.map((m) => {
                const next = valueValid && selected[m.id]
                  ? applyPriceMode(m.price_per_unit, mode, numericValue)
                  : null;
                return (
                  <tr key={m.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={!!selected[m.id]}
                        onChange={(e) =>
                          setSelected((s) => ({ ...s, [m.id]: e.target.checked }))
                        }
                        aria-label={`Select meter ${m.meter_number}`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <span className="block font-semibold">{m.meter_number}</span>
                      <span className="block text-xs text-muted-foreground">{m.serial_number}</span>
                    </td>
                    <td className="px-4 py-3 capitalize">{m.type}</td>
                    <td className="px-4 py-3">{m.supplier_name ?? "—"}</td>
                    <td className="px-4 py-3">{m.unit_label ?? "Unassigned"}</td>
                    <td className="px-4 py-3 text-right font-medium">{money(m.price_per_unit)}</td>
                    <td className="px-4 py-3 text-right">
                      {next === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span
                          className={
                            next === m.price_per_unit
                              ? "text-muted-foreground"
                              : next < 0
                                ? "font-semibold text-destructive"
                                : "font-semibold text-emerald-600"
                          }
                        >
                          {money(next)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Confirm price update"
            className="w-full max-w-lg rounded-2xl border border-border bg-card p-5"
          >
            <h2 className="text-base font-bold">Confirm price update</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {MODE_LABELS[mode]} {money(numericValue)} — {changing} meter(s) will be updated.
            </p>
            <ul className="mt-3 max-h-56 space-y-1 overflow-y-auto text-sm">
              {preview
                .filter((p) => p.to !== p.from)
                .map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 rounded-lg bg-secondary/50 px-3 py-2">
                    <span className="truncate font-medium">{p.meter_number}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {money(p.from)} → <span className="font-semibold text-foreground">{money(p.to)}</span>
                    </span>
                  </li>
                ))}
            </ul>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate()}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
                Update prices
              </button>
            </div>
          </div>
        </div>
      )}
    </PortalLayout>
  );
}
