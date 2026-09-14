import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  BadgeDollarSign,
  Download,
  Gauge,
  History,
  Loader2,
  RefreshCw,
  Search,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

import { PortalLayout } from "@/components/PortalLayout";
import { listMeters } from "@/lib/meters.functions";
import {
  applyPriceMode,
  bulkSetMeterPrice,
  listPriceAuditLogs,
  listPriceChangeRequests,
  reviewPriceChangeRequests,
  type PriceMode,
} from "@/lib/prices.functions";

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
  const fetchPriceLogs = useServerFn(listPriceAuditLogs);

  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [userType, setUserType] = useState<"all" | "landlord" | "agent" | "vendor">("all");
  const [userFilter, setUserFilter] = useState("all");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState<PriceMode>("set");
  const [value, setValue] = useState("");
  const [confirming, setConfirming] = useState(false);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["meters"],
    queryFn: () => fetchMeters(),
  });

  const { data: priceLogs = [], isLoading: logsLoading } = useQuery({
    queryKey: ["price-audit"],
    queryFn: () => fetchPriceLogs(),
  });

  const fetchPriceRequests = useServerFn(listPriceChangeRequests);
  const reviewRequests = useServerFn(reviewPriceChangeRequests);
  const { data: priceRequests = [] } = useQuery({
    queryKey: ["price-change-requests"],
    queryFn: () => fetchPriceRequests(),
  });
  const pendingRequests = priceRequests.filter((r) => r.status === "pending");
  const reviewedRequests = priceRequests.filter((r) => r.status !== "pending").slice(0, 10);

  const reviewMutation = useMutation({
    mutationFn: (vars: { ids: string[]; decision: "approved" | "rejected" }) =>
      reviewRequests({ data: vars }),
    onSuccess: (res, vars) => {
      toast.success(
        vars.decision === "approved"
          ? `Approved — ${res.applied} meter price(s) updated`
          : `Rejected ${res.rejected} request(s)`,
      );
      void queryClient.invalidateQueries({ queryKey: ["price-change-requests"] });
      void queryClient.invalidateQueries({ queryKey: ["meters"] });
      void queryClient.invalidateQueries({ queryKey: ["price-audit"] });
    },
    onError: (e: Error) => toast.error(e.message || "Could not review the request"),
  });

  const meters = data?.meters ?? [];
  const suppliers = data?.suppliers ?? [];
  const properties = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of data?.units ?? []) {
      if (u.property_id) map.set(u.property_id, u.property_name ?? "Unnamed property");
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data?.units]);

  /** People/vendors that can be assigned to meters, per selected user type. */
  const userOptions = useMemo(() => {
    if (userType === "landlord") return (data?.landlords ?? []).map((l) => ({ id: l.id, name: l.name }));
    if (userType === "agent") return (data?.agents ?? []).map((a) => ({ id: a.id, name: a.name }));
    if (userType === "vendor") return (data?.vendors ?? []).map((v) => ({ id: v.id, name: v.name }));
    return [];
  }, [userType, data?.landlords, data?.agents, data?.vendors]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return meters.filter((m) => {
      if (typeFilter !== "all" && m.type !== typeFilter) return false;
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      if (supplierFilter !== "all" && (m.supplier_id ?? "none") !== supplierFilter) return false;
      if (propertyFilter !== "all" && (m.property_id ?? "none") !== propertyFilter) return false;
      if (userType !== "all") {
        const assigned =
          userType === "landlord"
            ? m.landlord_id
            : userType === "agent"
              ? m.agent_id
              : m.vendor_id || null;
        if (!assigned) return false;
        if (userFilter !== "all" && assigned !== userFilter) return false;
      }
      if (!needle) return true;
      return [m.meter_number, m.serial_number, m.supplier_name ?? "", m.landlord_name ?? "", m.unit_label ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [meters, q, typeFilter, statusFilter, supplierFilter, propertyFilter, userType, userFilter]);

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
      await queryClient.invalidateQueries({ queryKey: ["price-audit"] });
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

  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines: string[] = [];
    lines.push(
      ["Meter number", "Serial", "Utility", "Supplier", "Unit", "Status", "Price per unit", "New price (pending rule)"]
        .map(esc)
        .join(","),
    );
    for (const m of rows) {
      const next =
        valueValid && selected[m.id] ? applyPriceMode(m.price_per_unit, mode, numericValue) : "";
      lines.push(
        [
          m.meter_number,
          m.serial_number,
          m.type,
          m.supplier_name ?? "",
          m.unit_label ?? "",
          m.status,
          m.price_per_unit.toFixed(2),
          next === "" ? "" : Number(next).toFixed(2),
        ]
          .map(esc)
          .join(","),
      );
    }
    lines.push("");
    lines.push(["Bulk price configuration"].map(esc).join(","));
    lines.push(["Rule", "Value", "Selected meters"].map(esc).join(","));
    lines.push([MODE_LABELS[mode], valueValid ? numericValue : "", selectedRows.length].map(esc).join(","));
    lines.push("");
    lines.push(["Price change history"].map(esc).join(","));
    lines.push(["When", "Changed by", "Meters", "Details"].map(esc).join(","));
    for (const b of priceLogs) {
      lines.push(
        [
          new Date(b.created_at).toLocaleString(),
          b.actor_name ?? "System",
          b.meters.length,
          b.meters.map((m) => `${m.meter_number}: ${m.from.toFixed(2)} -> ${m.to.toFixed(2)}`).join("; "),
        ]
          .map(esc)
          .join(","),
      );
    }

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `meter-prices-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} meter price row(s)`);
  };

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
        <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={exportCsv}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground hover:bg-accent/10"
        >
          <Download className="size-4" /> Export CSV
        </button>
        <button
          type="button"
          onClick={() => refetch()}
          aria-label="Refresh meters"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground hover:bg-accent/10"
        >
          <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </button>
        </div>
      }
    >
      <section className="mb-4 rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-foreground">Vendor price change requests</h2>
            <p className="text-xs text-muted-foreground">
              Approve a request to apply the new rate to the meter in both portals.
            </p>
          </div>
          {pendingRequests.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={reviewMutation.isPending}
                onClick={() =>
                  reviewMutation.mutate({
                    ids: pendingRequests.map((r) => r.id),
                    decision: "approved",
                  })
                }
                className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                Approve all ({pendingRequests.length})
              </button>
              <button
                type="button"
                disabled={reviewMutation.isPending}
                onClick={() =>
                  reviewMutation.mutate({
                    ids: pendingRequests.map((r) => r.id),
                    decision: "rejected",
                  })
                }
                className="rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-foreground hover:bg-accent/10 disabled:opacity-60"
              >
                Reject all
              </button>
            </div>
          )}
        </div>

        {pendingRequests.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No requests waiting for approval.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4">Requested</th>
                  <th className="py-2 pr-4">Vendor</th>
                  <th className="py-2 pr-4">Meter</th>
                  <th className="py-2 pr-4">Current</th>
                  <th className="py-2 pr-4">Requested</th>
                  <th className="py-2 pr-4">Reason</th>
                  <th className="py-2 pr-4 text-right">Decision</th>
                </tr>
              </thead>
              <tbody>
                {pendingRequests.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="py-2 pr-4">{new Date(r.created_at).toLocaleDateString()}</td>
                    <td className="py-2 pr-4">{r.vendor_name ?? "Vendor"}</td>
                    <td className="py-2 pr-4 font-semibold">{r.meter_number}</td>
                    <td className="py-2 pr-4">KES {r.current_price.toFixed(2)}</td>
                    <td className="py-2 pr-4 font-semibold">KES {r.requested_price.toFixed(2)}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{r.note ?? "—"}</td>
                    <td className="py-2 pr-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          disabled={reviewMutation.isPending}
                          onClick={() =>
                            reviewMutation.mutate({ ids: [r.id], decision: "approved" })
                          }
                          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={reviewMutation.isPending}
                          onClick={() =>
                            reviewMutation.mutate({ ids: [r.id], decision: "rejected" })
                          }
                          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent/10 disabled:opacity-60"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {reviewedRequests.length > 0 && (
          <ul className="mt-4 space-y-1 text-xs text-muted-foreground">
            {reviewedRequests.map((r) => (
              <li key={r.id}>
                {r.meter_number} · KES {r.current_price.toFixed(2)} → KES{" "}
                {r.requested_price.toFixed(2)} · {r.status}
                {r.reviewed_at ? ` · ${new Date(r.reviewed_at).toLocaleDateString()}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

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
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto_auto] md:items-center">
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
          <select
            value={propertyFilter}
            onChange={(e) => setPropertyFilter(e.target.value)}
            aria-label="Filter by property"
            className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
          >
            <option value="all">All properties</option>
            <option value="none">No property / unassigned</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            value={userType}
            onChange={(e) => {
              setUserType(e.target.value as typeof userType);
              setUserFilter("all");
            }}
            aria-label="Filter by user type"
            className="h-11 rounded-xl border border-border bg-background px-3 text-sm"
          >
            <option value="all">All user types</option>
            <option value="landlord">Landlord</option>
            <option value="agent">Agent</option>
            <option value="vendor">Vendor</option>
          </select>
          <select
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            disabled={userType === "all"}
            aria-label="Filter by assigned user"
            className="h-11 rounded-xl border border-border bg-background px-3 text-sm disabled:opacity-60"
          >
            <option value="all">
              {userType === "all" ? "Select a user type first" : `All ${userType}s`}
            </option>
            {userOptions.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
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

      <section className="mt-4 rounded-2xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <History className="size-4 text-primary" /> Price change history
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Every bulk and single price update, who made it and when.
        </p>
        {logsLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">Loading history…</p>
        ) : priceLogs.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">No price changes recorded yet.</p>
        ) : (
          <ol className="mt-4 space-y-3">
            {priceLogs.map((b) => (
              <li key={b.id} className="rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">
                    {b.meters.length} meter{b.meters.length === 1 ? "" : "s"} repriced
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(b.created_at).toLocaleString()} · by {b.actor_name ?? "System"}
                  </p>
                </div>
                <ul className="mt-2 flex flex-wrap gap-2 text-xs">
                  {b.meters.slice(0, 12).map((m, i) => (
                    <li key={`${m.id}-${i}`} className="rounded-lg bg-secondary/60 px-2 py-1">
                      <span className="font-medium">{m.meter_number}</span>{" "}
                      <span className="text-muted-foreground">
                        {money(m.from)} → {money(m.to)}
                      </span>
                    </li>
                  ))}
                  {b.meters.length > 12 && (
                    <li className="px-2 py-1 text-muted-foreground">
                      +{b.meters.length - 12} more
                    </li>
                  )}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </section>

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
