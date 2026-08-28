import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Download,
  Droplets,
  Flame,
  Gauge,
  Pencil,
  Loader2,
  Plus,
  RefreshCw,
  PowerOff,
  Search,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import {
  addMeter,
  bulkMeterAction,
  listMeters,
  listMeterAuditLogs,
  updateMeter,
  type MeterRow,
} from "@/lib/meters.functions";
import { PortalLayout } from "@/components/PortalLayout";

const DEFAULT_LIMIT = 10;
const LIMIT_OPTIONS = [10, 25, 50, 100];
const TYPES = ["electricity", "water", "gas"] as const;

function parseSearch(search: Record<string, unknown>) {
  const page = Math.max(1, Number(search["page"]) || 1);
  const limit = LIMIT_OPTIONS.includes(Number(search["limit"]))
    ? Number(search["limit"])
    : DEFAULT_LIMIT;
  const type =
    typeof search["type"] === "string" && (TYPES as readonly string[]).includes(search["type"])
      ? search["type"]
      : "all";
  const landlordId = typeof search["landlord"] === "string" ? search["landlord"] : "all";
  const q = typeof search["q"] === "string" ? search["q"] : "";
  const status =
    search["status"] === "active" || search["status"] === "inactive"
      ? (search["status"] as string)
      : "all";
  return { page, limit, type, landlordId, q, status };
}

export const Route = createFileRoute("/_authenticated/meters/")({
  validateSearch: parseSearch,
  head: () => ({
    meta: [
      { title: "Meter Management · SmatraPay" },
      {
        name: "description",
        content:
          "Manage the SmatraPay meter registry: vendor, landlord, meter and serial numbers, tariffs and STS key settings.",
      },
      { property: "og:title", content: "Meter Management · SmatraPay" },
      {
        property: "og:description",
        content: "Search, filter and maintain every registered electricity, water and gas meter.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MetersPage,
  errorComponent: ({ error }) => (
    <div className="p-10 text-sm text-destructive">{error.message}</div>
  ),
});

const TYPE_META = {
  electricity: { label: "Electricity", icon: Zap, tone: "bg-amber-500/12 text-amber-600" },
  water: { label: "Water", icon: Droplets, tone: "bg-sky-500/12 text-sky-600" },
  gas: { label: "Gas", icon: Flame, tone: "bg-orange-500/12 text-orange-600" },
} as const;

function typeMeta(type: string) {
  return TYPE_META[type as keyof typeof TYPE_META] ?? {
    label: type ? type.charAt(0).toUpperCase() + type.slice(1) : "Other",
    icon: Gauge,
    tone: "bg-muted text-muted-foreground",
  };
}

const money = (n: number) =>
  new Intl.NumberFormat("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

type SortKey =
  | "meter_number"
  | "serial_number"
  | "type"
  | "vendor_id"
  | "landlord_name"
  | "agent_name"
  | "unit_label"
  | "price_per_unit"
  | "status";

function MetersPage() {
  const queryClient = useQueryClient();
  const fetchMeters = useServerFn(listMeters);

  const {
    page: currentPage,
    limit: pageSize,
    type,
    landlordId,
    q: search,
    status: statusFilter,
  } = Route.useSearch();
  const navigate = useNavigate({ from: "/meters/" });
  const setPage = (page: number) => navigate({ search: (prev) => ({ ...prev, page }) });
  const setPageSize = (limit: number) =>
    navigate({ search: (prev) => ({ ...prev, page: 1, limit }) });
  const setType = (t: string) => navigate({ search: (prev) => ({ ...prev, page: 1, type: t }) });
  const setLandlordId = (landlordId: string) =>
    navigate({ search: (prev) => ({ ...prev, page: 1, landlordId }) });
  const setSearch = (q: string) => navigate({ search: (prev) => ({ ...prev, page: 1, q }) });
  const setStatusFilter = (status: string) =>
    navigate({ search: (prev) => ({ ...prev, page: 1, status }) });

  const [sortKey, setSortKey] = useState<SortKey>("meter_number");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editing, setEditing] = useState<MeterRow | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<null | "delete" | "deactivate" | "activate">(null);

  useEffect(() => {
    if (currentPage !== 1) setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, type, landlordId, statusFilter]);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["meters"],
    queryFn: () => fetchMeters(),
  });

  const meters = data?.meters ?? [];
  const landlords = data?.landlords ?? [];
  const agents = data?.agents ?? [];
  const unitOptions = data?.units ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return meters.filter((m) => {
      if (type !== "all" && m.type !== type) return false;
      if (landlordId !== "all" && (m.landlord_id ?? "none") !== landlordId) return false;
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      if (!q) return true;
      return [m.meter_number, m.serial_number, m.vendor_id, m.landlord_name ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [meters, search, type, landlordId, statusFilter]);

  const sortedRows = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        if (typeof av === "number" && typeof bv === "number") {
          return sortDir === "asc" ? av - bv : bv - av;
        }
        const as = String(av ?? "").toLowerCase();
        const bs = String(bv ?? "").toLowerCase();
        if (as === bs) return 0;
        return sortDir === "asc" ? (as > bs ? 1 : -1) : as > bs ? -1 : 1;
      }),
    [filtered, sortKey, sortDir],
  );

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const page = Math.min(currentPage, totalPages);
  const paged = sortedRows.slice((page - 1) * pageSize, page * pageSize);

  const pagedIds = paged.map((m) => m.id);
  const allPagedSelected = pagedIds.length > 0 && pagedIds.every((k) => selected.includes(k));
  const toggleRow = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((k) => k !== id) : [...prev, id]));
  const togglePage = () =>
    setSelected((prev) =>
      allPagedSelected
        ? prev.filter((k) => !pagedIds.includes(k))
        : [...new Set([...prev, ...pagedIds])],
    );
  const selectedMeters = useMemo(
    () => meters.filter((m) => selected.includes(m.id)),
    [meters, selected],
  );

  const runBulk = useServerFn(bulkMeterAction);
  const bulk = useMutation({
    mutationFn: async (action: "delete" | "deactivate" | "activate") =>
      runBulk({ data: { action, ids: selectedMeters.map((m) => m.id) } } as never),
    onSuccess: async (_res, action) => {
      const n = selectedMeters.length;
      setConfirm(null);
      setSelected([]);
      await queryClient.invalidateQueries({ queryKey: ["meters"] });
      toast.success(
        action === "delete"
          ? `${n} meter${n === 1 ? "" : "s"} deleted`
          : `${n} meter${n === 1 ? "" : "s"} ${action === "activate" ? "activated" : "deactivated"}`,
      );
    },
    onError: (err: Error) => toast.error(err.message || "Bulk action failed"),
  });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const counts = useMemo(
    () => ({
      total: meters.length,
      electricity: meters.filter((m) => m.type === "electricity").length,
      water: meters.filter((m) => m.type === "water").length,
      gas: meters.filter((m) => m.type === "gas").length,
    }),
    [meters],
  );

  const exportCsv = () => {
    const rows = [
      [
        "Meter number",
        "Serial number",
        "Type",
        "Vendor",
        "Landlord",
        "Agent",
        "Unit",
        "Initial reading",
        "Price per unit",
        "Status",
        "SGC",
        "KRN",
        "TI",
        "EA",
        "KEN",
      ],
      ...sortedRows.map((m) => [
        m.meter_number,
        m.serial_number,
        typeMeta(m.type).label,
        m.vendor_id,
        m.landlord_name ?? "—",
        m.agent_name ?? "—",
        m.unit_label ?? "—",
        money(m.initial_reading),
        money(m.price_per_unit),
        m.status,
        m.sgc ?? "",
        m.krn ?? "",
        m.ti ?? "",
        m.ea ?? "",
        m.ken ?? "",
      ]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(
      new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `smatrapay-meters-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const SortHeader = ({ label, sortBy }: { label: string; sortBy: SortKey }) => (
    <th className="px-3 py-2 font-semibold">
      <button
        type="button"
        onClick={() => toggleSort(sortBy)}
        className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-foreground"
      >
        {label}
        {sortKey === sortBy &&
          (sortDir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    </th>
  );

  return (
    <PortalLayout
      roles={["admin"]}
      title="Meter Management"
      description="All registered electricity, water and gas meters"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <Plus className="size-4" /> Add Meter
          </button>
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground hover:bg-accent/10"
          >
            <Upload className="size-4" /> Import CSV
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!sortedRows.length}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground hover:bg-accent/10 disabled:opacity-60"
          >
            <Download className="size-4" /> Export CSV ({sortedRows.length})
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
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total Meters" value={counts.total} icon={Gauge} />
          <StatCard
            label="Electricity"
            value={counts.electricity}
            icon={Zap}
            tone="text-amber-600"
          />
          <StatCard label="Water" value={counts.water} icon={Droplets} tone="text-sky-600" />
          <StatCard label="Gas" value={counts.gas} icon={Flame} tone="text-orange-600" />
        </div>

        <section className="rounded-2xl border border-border bg-card">
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
            <div className="flex min-w-[180px] flex-1 items-stretch overflow-hidden rounded-lg border border-border focus-within:border-primary">
              <span className="flex items-center bg-muted/50 px-2.5 text-muted-foreground">
                <Search className="size-4" />
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search meter no / serial / vendor"
                aria-label="Search meters"
                className="w-full bg-background px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground/70"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="flex items-center px-2 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              aria-label="Filter by meter type"
              className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary"
            >
              <option value="all">All types</option>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_META[t].label}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by meter status"
              className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <select
              value={landlordId}
              onChange={(e) => setLandlordId(e.target.value)}
              aria-label="Filter by landlord"
              className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary"
            >
              <option value="all">All landlords</option>
              <option value="none">Unassigned</option>
              {landlords.map((l: { id: string; name: string }) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            {(search || type !== "all" || landlordId !== "all" || statusFilter !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setType("all");
                  setLandlordId("all");
                  setStatusFilter("all");
                }}
                className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>

          {selected.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-primary/5 px-3 py-2 text-sm">
              <span className="font-medium text-foreground">{selected.length} selected</span>
              <button
                type="button"
                onClick={() => setConfirm("deactivate")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent/10"
              >
                <PowerOff className="size-3.5" /> Deactivate
              </button>
              <button
                type="button"
                onClick={() => setConfirm("activate")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent/10"
              >
                <Gauge className="size-3.5" /> Activate
              </button>
              <button
                type="button"
                onClick={() => setConfirm("delete")}
                className="inline-flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground hover:opacity-90"
              >
                <Trash2 className="size-3.5" /> Delete
              </button>
              <button
                type="button"
                onClick={() => setSelected([])}
                className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Clear selection
              </button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-10 px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label="Select all meters on this page"
                      checked={allPagedSelected}
                      onChange={togglePage}
                      className="size-4 accent-primary"
                    />
                  </th>
                  <SortHeader label="Meter no." sortBy="meter_number" />
                  <SortHeader label="Serial" sortBy="serial_number" />
                  <SortHeader label="Type" sortBy="type" />
                  <SortHeader label="Vendor" sortBy="vendor_id" />
                  <SortHeader label="Landlord" sortBy="landlord_name" />
                  <SortHeader label="Agent" sortBy="agent_name" />
                  <SortHeader label="Unit" sortBy="unit_label" />
                  <SortHeader label="Price / unit" sortBy="price_per_unit" />
                  <th className="px-3 py-2 font-semibold uppercase tracking-wide">STS</th>
                  <SortHeader label="Status" sortBy="status" />
                  <th className="px-3 py-2 text-right font-semibold uppercase tracking-wide">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {isLoading ? (
                  <tr>
                    <td colSpan={12} className="px-3 py-8 text-center text-muted-foreground">
                      <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
                      Loading meters…
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={12} className="px-3 py-8 text-center text-destructive">
                      {(error as Error).message}
                    </td>
                  </tr>
                ) : paged.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-3 py-8 text-center text-muted-foreground">
                      No meters match your filters. Use “Add Meter” to register one.
                    </td>
                  </tr>
                ) : (
                  paged.map((m) => {
                    const meta = typeMeta(m.type);
                    const Icon = meta.icon;
                    const sts = [
                      m.sgc != null ? `SGC ${m.sgc}` : null,
                      m.krn != null ? `KRN ${m.krn}` : null,
                      m.ti != null ? `TI ${m.ti}` : null,
                      m.ea != null ? `EA ${m.ea}` : null,
                      m.ken != null ? `KEN ${m.ken}` : null,
                    ].filter(Boolean);
                    return (
                      <tr
                        key={m.id}
                        className={`border-t border-border/70 ${selected.includes(m.id) ? "bg-primary/5" : ""}`}
                      >
                        <td className="px-3 py-2.5">
                          <input
                            type="checkbox"
                            aria-label={`Select meter ${m.meter_number}`}
                            checked={selected.includes(m.id)}
                            onChange={() => toggleRow(m.id)}
                            className="size-4 accent-primary"
                          />
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span
                              className={`inline-flex size-8 shrink-0 items-center justify-center rounded-lg ${meta.tone}`}
                            >
                              <Icon className="size-4" />
                            </span>
                            <div className="min-w-0">
                              <div className="truncate font-medium text-foreground">
                                {m.meter_number}
                              </div>
                              <div className="truncate text-xs text-muted-foreground">
                                Initial {money(m.initial_reading)}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                          {m.serial_number}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${meta.tone}`}
                          >
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                          {m.vendor_id || "—"}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                          {m.landlord_name ?? "Unassigned"}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                          {m.agent_name ?? "—"}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                          {m.unit_label ?? "—"}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-foreground">
                          {money(m.price_per_unit)}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">
                          {sts.length ? sts.join(" · ") : "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                              m.status === "active"
                                ? "bg-emerald-500/12 text-emerald-600"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {m.status}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => setEditing(m)}
                            aria-label={`Edit meter ${m.meter_number}`}
                            className="inline-flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent/10"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <span>Rows per page</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="rounded-lg border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
              >
                {LIMIT_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <span>
                {sortedRows.length === 0 ? 0 : (page - 1) * pageSize + 1}–
                {Math.min(page * pageSize, sortedRows.length)} of {sortedRows.length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page <= 1}
                className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent/10 disabled:opacity-50"
                aria-label="Previous page"
              >
                <ChevronLeft className="size-4" />
              </button>
              <span className="text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
                className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent/10 disabled:opacity-50"
                aria-label="Next page"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        </section>
      </div>

      {confirm && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bulk-meter-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !bulk.isPending) setConfirm(null);
          }}
        >
          <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-lg">
            <h2 id="bulk-meter-title" className="text-lg font-bold capitalize">
              {confirm} {selected.length} meter{selected.length === 1 ? "" : "s"}?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {confirm === "delete"
                ? "The selected meters will be permanently removed from the registry. This cannot be undone."
                : confirm === "deactivate"
                  ? "The selected meters stay on record but are marked inactive."
                  : "The selected meters will be marked active again."}
            </p>
            <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              {selectedMeters.slice(0, 20).map((m) => (
                <li key={m.id}>
                  {m.meter_number} · {typeMeta(m.type).label} · {m.serial_number}
                </li>
              ))}
              {selectedMeters.length > 20 && <li>+{selectedMeters.length - 20} more…</li>}
            </ul>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                disabled={bulk.isPending}
                onClick={() => setConfirm(null)}
                className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent/10 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={bulk.isPending}
                onClick={() => bulk.mutate(confirm)}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60 ${
                  confirm === "delete"
                    ? "bg-destructive text-destructive-foreground"
                    : "bg-primary text-primary-foreground"
                }`}
              >
                {bulk.isPending && <Loader2 className="size-4 animate-spin" />}
                <span className="capitalize">{confirm}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <ImportMetersDialog
          onClose={() => setShowImport(false)}
          onImported={async () => {
            await queryClient.invalidateQueries({ queryKey: ["meters"] });
          }}
        />
      )}

      {(showAdd || editing) && (
        <MeterDialog
          meter={editing}
          landlords={landlords}
          agents={agents}
          units={unitOptions}
          existing={meters}
          onClose={() => {
            setShowAdd(false);
            setEditing(null);
          }}
          onSaved={async () => {
            const wasEdit = Boolean(editing);
            setShowAdd(false);
            setEditing(null);
            await queryClient.invalidateQueries({ queryKey: ["meters"] });
            toast.success(wasEdit ? "Meter updated" : "Meter added");
          }}
        />
      )}
    </PortalLayout>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof Gauge;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon className={`size-4 ${tone ?? "text-primary"}`} />
      </div>
      <div className="mt-2 text-2xl font-bold text-foreground">{value}</div>
    </div>
  );
}

const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9/_-]*$/;

function identifierError(label: string, value: string) {
  const v = value.trim();
  if (!v) return `${label} is required`;
  if (v.length < 4) return `${label} must be at least 4 characters`;
  if (v.length > 64) return `${label} must be at most 64 characters`;
  if (!IDENTIFIER_RE.test(v)) return `${label} may only contain letters, numbers, - _ /`;
  return null;
}

function MeterDialog({
  meter,
  landlords,
  agents,
  units,
  existing,
  onClose,
  onSaved,
}: {
  meter: MeterRow | null;
  landlords: { id: string; name: string }[];
  agents: { id: string; name: string }[];
  units: { id: string; label: string }[];
  existing: MeterRow[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const isEdit = Boolean(meter);
  const createMeter = useServerFn(addMeter);
  const editMeter = useServerFn(updateMeter);

  const [vendorId, setVendorId] = useState(meter?.vendor_id ?? "");
  const [landlordId, setLandlordId] = useState(meter?.landlord_id ?? "");
  const [agentId, setAgentId] = useState(meter?.agent_id ?? "");
  const [unitId, setUnitId] = useState(meter?.unit_id ?? "");
  const [meterNumber, setMeterNumber] = useState(meter?.meter_number ?? "");
  const [serialNumber, setSerialNumber] = useState(meter?.serial_number ?? "");
  const [meterType, setMeterType] = useState<"electricity" | "water" | "gas">(
    (meter?.type as "electricity" | "water" | "gas") ?? "electricity",
  );
  const [initialReading, setInitialReading] = useState(String(meter?.initial_reading ?? "0"));
  const [pricePerUnit, setPricePerUnit] = useState(String(meter?.price_per_unit ?? "0"));
  const [status, setStatus] = useState<"active" | "inactive">(
    meter?.status === "inactive" ? "inactive" : "active",
  );
  const [sts, setSts] = useState({
    sgc: meter?.sgc != null ? String(meter.sgc) : "",
    krn: meter?.krn != null ? String(meter.krn) : "",
    ti: meter?.ti != null ? String(meter.ti) : "",
    ea: meter?.ea != null ? String(meter.ea) : "",
    ken: meter?.ken != null ? String(meter.ken) : "",
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const others = useMemo(
    () => existing.filter((m) => m.id !== meter?.id),
    [existing, meter?.id],
  );

  const meterNumberError = useMemo(() => {
    const base = identifierError("Meter number", meterNumber);
    if (base) return base;
    const v = meterNumber.trim().toLowerCase();
    if (others.some((m) => m.meter_number.toLowerCase() === v))
      return "This meter number is already registered";
    return null;
  }, [meterNumber, others]);

  const serialNumberError = useMemo(() => {
    const base = identifierError("Serial number", serialNumber);
    if (base) return base;
    const v = serialNumber.trim().toLowerCase();
    if (others.some((m) => m.serial_number.toLowerCase() === v))
      return "This serial number is already registered";
    if (v && v === meterNumber.trim().toLowerCase())
      return "Serial number must differ from the meter number";
    return null;
  }, [serialNumber, meterNumber, others]);

  const vendorError = vendorId.trim() ? null : "Vendor is required";
  const hasErrors = Boolean(meterNumberError || serialNumberError || vendorError);

  const mutation = useMutation({
    mutationFn: async () => {
      if (hasErrors) throw new Error(vendorError || meterNumberError || serialNumberError || "");
      const payload = {
        vendor_id: vendorId.trim(),
        landlord_id: landlordId || null,
        agent_id: agentId || null,
        unit_id: unitId || null,
        meter_number: meterNumber.trim(),
        serial_number: serialNumber.trim(),
        type: meterType,
        initial_reading: initialReading,
        price_per_unit: pricePerUnit,
        status,
        sgc: sts.sgc,
        krn: sts.krn,
        ti: sts.ti,
        ea: sts.ea,
        ken: sts.ken,
      };
      if (isEdit && meter) await editMeter({ data: { ...payload, id: meter.id } } as never);
      else await createMeter({ data: payload } as never);
    },
    onSuccess: () => onSaved(),
    onError: (err: Error) =>
      toast.error(err.message || (isEdit ? "Could not update meter" : "Could not add meter")),
  });

  const field = "h-11 w-full rounded-xl border bg-background px-3 text-sm";
  const fieldError = (msg: string | null) =>
    msg ? `${field} border-destructive focus:border-destructive` : field;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-meter-title"
    >
      <div className="my-8 w-full max-w-lg rounded-2xl border bg-card p-6 shadow-lg">
        <h2 id="add-meter-title" className="text-lg font-bold">
          {isEdit ? "Edit Meter" : "Add Meter"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {isEdit
            ? "Update the meter details. Meter and serial numbers must stay unique."
            : "Register a meter in the meter registry."}
        </p>


        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="meter-vendor">
              Vendor
            </label>
            <input
              id="meter-vendor"
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
              placeholder="e.g. STRON"
              aria-invalid={Boolean(vendorError)}
              className={fieldError(vendorError)}
            />
            {vendorError && <p className="mt-1 text-xs text-destructive">{vendorError}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="meter-landlord">
              Landlord
            </label>
            <select
              id="meter-landlord"
              value={landlordId}
              onChange={(e) => setLandlordId(e.target.value)}
              className={field}
            >
              <option value="">Unassigned</option>
              {landlords.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium" htmlFor="meter-unit">
              Unit <span className="text-muted-foreground">(optional)</span>
            </label>
            <select
              id="meter-unit"
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              className={field}
            >
              <option value="">Not linked to a unit</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="meter-agent">
              Agent
            </label>
            <select
              id="meter-agent"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className={field}
            >
              <option value="">Unassigned</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="meter-number">
              Meter Number
            </label>
            <input
              id="meter-number"
              value={meterNumber}
              onChange={(e) => setMeterNumber(e.target.value)}
              placeholder="e.g. 01234567890"
              aria-invalid={Boolean(meterNumberError)}
              aria-describedby="meter-number-error"
              className={fieldError(meterNumberError)}
            />
            {meterNumberError && (
              <p id="meter-number-error" className="mt-1 text-xs text-destructive">
                {meterNumberError}
              </p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="meter-serial">
              Serial Number
            </label>
            <input
              id="meter-serial"
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
              placeholder="e.g. EM-2026-001"
              aria-invalid={Boolean(serialNumberError)}
              aria-describedby="meter-serial-error"
              className={fieldError(serialNumberError)}
            />
            {serialNumberError && (
              <p id="meter-serial-error" className="mt-1 text-xs text-destructive">
                {serialNumberError}
              </p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="meter-status">
              Status
            </label>
            <select
              id="meter-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as "active" | "inactive")}
              className={field}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="meter-type">
              Meter Type
            </label>
            <select
              id="meter-type"
              value={meterType}
              onChange={(e) => setMeterType(e.target.value as typeof meterType)}
              className={field}
            >
              <option value="electricity">Electricity</option>
              <option value="water">Water</option>
              <option value="gas">Gas</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="meter-price">
              Price per unit
            </label>
            <input
              id="meter-price"
              type="number"
              step="0.01"
              min="0"
              value={pricePerUnit}
              onChange={(e) => setPricePerUnit(e.target.value)}
              className={field}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="meter-initial">
              Initial reading
            </label>
            <input
              id="meter-initial"
              type="number"
              step="0.01"
              min="0"
              value={initialReading}
              onChange={(e) => setInitialReading(e.target.value)}
              className={field}
            />
          </div>
        </div>

        <fieldset className="mt-5 rounded-xl border border-border p-4">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            STS settings (optional)
          </legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {(
              [
                ["sgc", "SGC"],
                ["krn", "KRN"],
                ["ti", "TI"],
                ["ea", "EA"],
                ["ken", "KEN"],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <label className="mb-1 block text-xs font-medium" htmlFor={`meter-${key}`}>
                  {label}
                </label>
                <input
                  id={`meter-${key}`}
                  type="number"
                  value={sts[key]}
                  onChange={(e) => setSts((prev) => ({ ...prev, [key]: e.target.value }))}
                  className="h-10 w-full rounded-lg border bg-background px-2 text-sm"
                />
              </div>
            ))}
          </div>
        </fieldset>

        {isEdit && meter && <MeterHistory meterId={meter.id} />}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent/10"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={mutation.isPending || hasErrors}
            onClick={() => mutation.mutate()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
            {isEdit ? "Save Changes" : "Save Meter"}
          </button>
        </div>
      </div>
    </div>
  );
}

const HISTORY_LABELS: Record<string, string> = {
  initial_reading: "Reading",
  price_per_unit: "Price per unit",
  type: "Type",
  status: "Status",
};

function MeterHistory({ meterId }: { meterId: string }) {
  const fetchLogs = useServerFn(listMeterAuditLogs);
  const { data, isLoading } = useQuery({
    queryKey: ["meter-audit", meterId],
    queryFn: () => fetchLogs({ data: { meter_id: meterId } }),
  });
  const logs = data?.logs ?? [];

  return (
    <section className="mt-6 rounded-xl border border-border bg-background p-4">
      <h3 className="text-xs font-bold tracking-wide uppercase text-muted-foreground">
        Change history
      </h3>
      {isLoading ? (
        <p className="mt-2 text-sm text-muted-foreground">Loading history…</p>
      ) : logs.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No changes recorded yet.</p>
      ) : (
        <ol className="mt-3 max-h-56 space-y-3 overflow-y-auto pr-1">
          {logs.map((log) => (
            <li key={log.id} className="border-l-2 border-primary/40 pl-3">
              <p className="text-xs text-muted-foreground">
                {new Date(log.created_at).toLocaleString()} ·{" "}
                <span className="font-medium text-foreground">{log.actor_name ?? "System"}</span>
              </p>
              <ul className="mt-1 space-y-0.5 text-xs">
                {Object.entries(log.changes).map(([field, diff]) => (
                  <li key={field}>
                    <span className="font-medium">{HISTORY_LABELS[field] ?? field}:</span>{" "}
                    <span className="text-muted-foreground line-through">{diff.old ?? "—"}</span>{" "}
                    → <span className="font-semibold">{diff.new ?? "—"}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
