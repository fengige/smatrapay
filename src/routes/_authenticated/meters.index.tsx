import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
  Eye,
  Flame,
  Gauge,
  Link2,
  Pencil,
  Power,
  Loader2,
  Plus,
  RefreshCw,
  PowerOff,
  Search,
  Trash2,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import {
  addMeter,
  bulkAddMeters,
  bulkMeterAction,
  listMeters,
  listMeterAuditLogs,
  importMeters,
  METER_CSV_HEADERS,
  setMeterStatus,
  updateMeter,
  type MeterRow,
} from "@/lib/meters.functions";
import { PortalLayout } from "@/components/PortalLayout";
import { AssignMeterDialog } from "./meters.$meterId";

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
  
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editing, setEditing] = useState<MeterRow | null>(null);
  const [assigning, setAssigning] = useState<MeterRow | null>(null);
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
  const vendors = data?.vendors ?? [];
  const unitOptions = data?.units ?? [];
  const supplierOptions = data?.suppliers ?? [];

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

  const changeStatus = useServerFn(setMeterStatus);
  const statusMutation = useMutation({
    mutationFn: async (vars: { id: string; status: "active" | "inactive"; label: string }) =>
      changeStatus({ data: { id: vars.id, status: vars.status } } as never),
    onSuccess: async (_res, vars) => {
      await queryClient.invalidateQueries({ queryKey: ["meters"] });
      toast.success(
        `Meter ${vars.label} ${vars.status === "active" ? "activated" : "deactivated"}`,
      );
    },
    onError: (err: Error) => toast.error(err.message || "Could not update meter status"),
  });

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
            onClick={() => navigate({ to: "/meters/bulk-add" })}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground hover:bg-accent/10"
          >
            <Plus className="size-4" /> Add Meters
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
                      No meters match your filters. Use “Add Meters” or “Import CSV” to register meters.
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
                          <div className="inline-flex items-center gap-1">
                            <Link
                              to="/meters/$meterId"
                              params={{ meterId: m.id }}
                              aria-label={`View meter ${m.meter_number}`}
                              title="View details"
                              className="inline-flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent/10"
                            >
                              <Eye className="size-3.5" />
                            </Link>
                            <button
                              type="button"
                              onClick={() => setAssigning(m)}
                              aria-label={`Assign meter ${m.meter_number}`}
                              title="Assign meter"
                              className="inline-flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent/10"
                            >
                              <Link2 className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={statusMutation.isPending}
                              onClick={() =>
                                statusMutation.mutate({
                                  id: m.id,
                                  status: m.status === "active" ? "inactive" : "active",
                                  label: m.meter_number,
                                })
                              }
                              aria-label={`${m.status === "active" ? "Deactivate" : "Activate"} meter ${m.meter_number}`}
                              title={m.status === "active" ? "Deactivate" : "Activate"}
                              className="inline-flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent/10 disabled:opacity-50"
                            >
                              {m.status === "active" ? (
                                <PowerOff className="size-3.5" />
                              ) : (
                                <Power className="size-3.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditing(m)}
                              aria-label={`Edit meter ${m.meter_number}`}
                              title="Edit meter"
                              className="inline-flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent/10"
                            >
                              <Pencil className="size-3.5" />
                            </button>
                          </div>
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

      {showBulkAdd && (
        <BulkAddMetersDialog
          vendors={vendors}
          landlords={landlords}
          agents={agents}
          suppliers={supplierOptions}
          onClose={() => setShowBulkAdd(false)}
          onSaved={async (count: number) => {
            setShowBulkAdd(false);
            await queryClient.invalidateQueries({ queryKey: ["meters"] });
            toast.success(`${count} meter${count === 1 ? "" : "s"} added`);
          }}
        />
      )}

      {showImport && (
        <ImportMetersDialog
          onClose={() => setShowImport(false)}
          onImported={async () => {
            await queryClient.invalidateQueries({ queryKey: ["meters"] });
          }}
        />
      )}

      {assigning && (
        <AssignMeterDialog
          meterId={assigning.id}
          current={{
            unit_id: assigning.unit_id,
            landlord_id: assigning.landlord_id,
            agent_id: assigning.agent_id,
          }}
          units={unitOptions}
          landlords={landlords}
          agents={agents}
          onClose={() => setAssigning(null)}
        />
      )}

      {editing && (
        <MeterDialog
          meter={editing}
          landlords={landlords}
          agents={agents}
          units={unitOptions}
          suppliers={supplierOptions}
          existing={meters}
          onClose={() => {
            setEditing(null);
          }}
          onSaved={async () => {
            setEditing(null);
            await queryClient.invalidateQueries({ queryKey: ["meters"] });
            toast.success("Meter updated");
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
  suppliers,
  existing,
  onClose,
  onSaved,
}: {
  meter: MeterRow | null;
  landlords: { id: string; name: string }[];
  agents: { id: string; name: string }[];
  units: { id: string; label: string }[];
  suppliers: { id: string; name: string }[];
  existing: MeterRow[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const isEdit = Boolean(meter);
  const createMeter = useServerFn(addMeter);
  const editMeter = useServerFn(updateMeter);

  const [vendorId, setVendorId] = useState(meter?.vendor_id ?? "");
  const [supplierId, setSupplierId] = useState(meter?.supplier_id ?? "");
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
        supplier_id: supplierId || null,
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
            <label className="mb-1 block text-sm font-medium" htmlFor="meter-supplier">
              Supplier <span className="text-muted-foreground">(optional)</span>
            </label>
            <select
              id="meter-supplier"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className={field}
            >
              <option value="">No supplier</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
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


/* ---------------- CSV import ---------------- */

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const clean = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const HEADER_ALIASES: Record<string, string> = {
  "meter number": "meter_number",
  meterno: "meter_number",
  "serial number": "serial_number",
  serail_number: "serial_number",
  "serail number": "serial_number",
  vendor: "vendor_id",
  landlord: "landlord_email",
  agent: "agent_email",
  "initial reading": "initial_reading",
  "price per unit": "price_per_unit",
};

function normalizeHeader(h: string) {
  const key = h.trim().toLowerCase();
  return HEADER_ALIASES[key] ?? key.replace(/\s+/g, "_");
}

function downloadTemplate() {
  const csv = `${METER_CSV_HEADERS.join(",")}\nMTR-0001,SN-0001,electricity,Kenya Power,landlord@example.com,,0,25.50,active,,,,,`;
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "smatrapay-meters-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function ImportMetersDialog({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => Promise<void> | void;
}) {
  const runImport = useServerFn(importMeters);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [dupMode, setDupMode] = useState<"reject" | "skip" | "update">("reject");
  const [confirmUpdate, setConfirmUpdate] = useState(false);
  const [result, setResult] = useState<{
    imported: number;
    updated: number;
    skipped: number;
    failed: number;
    errors: { row: number; meter_number: string; message: string }[];
    duplicates: { row: number; meter_number: string; serial_number: string; reason: string }[];
  } | null>(null);

  const importMutation = useMutation({
    mutationFn: async () =>
      runImport({
        data: {
          duplicate_mode: dupMode,
          rows: rows.map((r, i) => ({
            row: i + 2,
            meter_number: r["meter_number"] ?? "",
            serial_number: r["serial_number"] ?? "",
            type: r["type"] ?? "",
            vendor_id: r["vendor_id"] ?? "",
            landlord_email: r["landlord_email"] ?? "",
            agent_email: r["agent_email"] ?? "",
            initial_reading: r["initial_reading"] ?? "",
            price_per_unit: r["price_per_unit"] ?? "",
            status: r["status"] ?? "",
            sgc: r["sgc"] ?? "",
            krn: r["krn"] ?? "",
            ti: r["ti"] ?? "",
            ea: r["ea"] ?? "",
            ken: r["ken"] ?? "",
          })),
        },
      } as never),
    onSuccess: async (res: any) => {
      setResult(res);
      await onImported();
      if (res.imported) toast.success(`${res.imported} meter${res.imported === 1 ? "" : "s"} imported`);
      if (res.updated) toast.success(`${res.updated} existing meter${res.updated === 1 ? "" : "s"} updated`);
      if (res.skipped) toast.message(`${res.skipped} duplicate row${res.skipped === 1 ? "" : "s"} skipped`);
      if (res.failed) toast.error(`${res.failed} row${res.failed === 1 ? "" : "s"} failed`);
    },
    onError: (err: Error) => toast.error(err.message || "Import failed"),
  });


  const onFile = async (file: File) => {
    setResult(null);
    setParseError(null);
    setFileName(file.name);
    const table = parseCsv(await file.text());
    if (table.length < 2) {
      setRows([]);
      setParseError("The file has no data rows.");
      return;
    }
    const headers = (table[0] ?? []).map(normalizeHeader);
    if (!headers.includes("meter_number") || !headers.includes("serial_number")) {
      setRows([]);
      setParseError("CSV must include meter_number and serial_number columns.");
      return;
    }
    setRows(
      table.slice(1).map((r) =>
        Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()])),
      ),
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-meters-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !importMutation.isPending) onClose();
      }}
    >
      <div className="w-full max-w-2xl rounded-2xl border bg-card p-6 shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="import-meters-title" className="text-lg font-bold">
              Import meters from CSV
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Meter number and serial number uniqueness is validated on the server. Choose how
              duplicates are handled below.
            </p>

          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close import dialog"
            className="rounded-lg p-1 text-muted-foreground hover:bg-accent/10"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium hover:bg-accent/10">
              <Upload className="size-4" /> Choose CSV
              <input
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onFile(f);
                }}
              />
            </label>
            <button
              type="button"
              onClick={downloadTemplate}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium hover:bg-accent/10"
            >
              <Download className="size-4" /> Download template
            </button>
            {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
          </div>

          {parseError && <p className="text-sm text-destructive">{parseError}</p>}

          {!result && (
            <fieldset className="rounded-xl border border-border p-3">
              <legend className="px-1 text-xs font-semibold uppercase text-muted-foreground">
                Duplicate handling
              </legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {(
                  [
                    ["reject", "Reject", "Fail rows whose meter/serial already exists"],
                    ["skip", "Skip", "Leave existing meters untouched and ignore those rows"],
                    ["update", "Update", "Overwrite matching meters with the CSV values"],
                  ] as const
                ).map(([value, label, hint]) => (
                  <label
                    key={value}
                    className={`cursor-pointer rounded-lg border p-2.5 text-xs ${
                      dupMode === value ? "border-primary bg-primary/5" : "border-border"
                    }`}
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <input
                        type="radio"
                        name="duplicate-mode"
                        value={value}
                        checked={dupMode === value}
                        onChange={() => {
                          setDupMode(value);
                          setConfirmUpdate(false);
                        }}
                      />
                      {label}
                    </span>
                    <span className="mt-1 block text-muted-foreground">{hint}</span>
                  </label>
                ))}
              </div>
              {dupMode === "update" && (
                <label className="mt-3 flex items-start gap-2 rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">
                  <input
                    type="checkbox"
                    checked={confirmUpdate}
                    onChange={(e) => setConfirmUpdate(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    I confirm that existing meters matching these meter numbers or serial numbers
                    should be overwritten with the values in this file.
                  </span>
                </label>
              )}
            </fieldset>
          )}


          {rows.length > 0 && !result && (
            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-semibold uppercase">Meter no</th>
                    <th className="px-3 py-2 font-semibold uppercase">Serial</th>
                    <th className="px-3 py-2 font-semibold uppercase">Type</th>
                    <th className="px-3 py-2 font-semibold uppercase">Vendor</th>
                    <th className="px-3 py-2 font-semibold uppercase">Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.slice(0, 8).map((r, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2">{r["meter_number"]}</td>
                      <td className="px-3 py-2">{r["serial_number"]}</td>
                      <td className="px-3 py-2">{r["type"]}</td>
                      <td className="px-3 py-2">{r["vendor_id"]}</td>
                      <td className="px-3 py-2">{r["price_per_unit"]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                {rows.length} row{rows.length === 1 ? "" : "s"} ready to import
                {rows.length > 8 ? " (showing first 8)" : ""}
              </p>
            </div>
          )}

          {result && (
            <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3 text-sm">
              <p className="font-semibold">
                {result.imported} imported · {result.updated} updated · {result.skipped} skipped ·{" "}
                {result.failed} failed
              </p>
              {result.duplicates.length > 0 && (
                <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                  {result.duplicates.map((d) => (
                    <li key={`dup-${d.row}-${d.meter_number}`}>
                      Row {d.row} ({d.meter_number} / {d.serial_number}): {d.reason}
                    </li>
                  ))}
                </ul>
              )}
              {result.errors.length > 0 && (
                <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-destructive">
                  {result.errors.map((e, i) => (
                    <li key={`${e.row}-${e.meter_number}-${i}`}>
                      Row {e.row}
                      {e.meter_number ? ` (${e.meter_number})` : ""}: {e.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={importMutation.isPending}
            className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent/10 disabled:opacity-60"
          >
            {result ? "Close" : "Cancel"}
          </button>
          {!result && (
            <button
              type="button"
              disabled={
                !rows.length ||
                importMutation.isPending ||
                (dupMode === "update" && !confirmUpdate)
              }
              onClick={() => importMutation.mutate()}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {importMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              {dupMode === "update" ? "Import & update" : "Import"} {rows.length || ""} meter
              {rows.length === 1 ? "" : "s"}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}

type BulkRow = {
  meter_number: string;
  serial_number: string;
  sgc: string;
  krn: string;
  ti: string;
  ea: string;
  ken: string;
};

const emptyBulkRow = (): BulkRow => ({
  meter_number: "",
  serial_number: "",
  sgc: "",
  krn: "",
  ti: "",
  ea: "",
  ken: "",
});

function BulkAddMetersDialog({
  vendors,
  landlords,
  agents,
  suppliers,
  onClose,
  onSaved,
}: {
  vendors: { id: string; name: string }[];
  landlords: { id: string; name: string }[];
  agents: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
  onClose: () => void;
  onSaved: (count: number) => void | Promise<void>;
}) {
  const bulkCreate = useServerFn(bulkAddMeters);

  const [supplierId, setSupplierId] = useState("");
  const [ownerType, setOwnerType] = useState<"vendor" | "landlord" | "agent">("vendor");
  const [ownerId, setOwnerId] = useState("");
  const [meterType, setMeterType] = useState<"electricity" | "water" | "gas">("electricity");
  const [pricePerUnit, setPricePerUnit] = useState("0");
  const [initialReading, setInitialReading] = useState("0");
  const [count, setCount] = useState("5");
  const [rows, setRows] = useState<BulkRow[]>([]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    setOwnerId("");
  }, [ownerType]);

  const ownerOptions =
    ownerType === "vendor" ? vendors : ownerType === "landlord" ? landlords : agents;

  const generateRows = () => {
    const n = Math.max(1, Math.min(500, Number(count) || 0));
    setRows((prev) =>
      Array.from({ length: n }, (_, i) => prev[i] ?? emptyBulkRow()),
    );
  };

  const setRow = (i: number, key: keyof BulkRow, value: string) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));

  const rowErrors = useMemo(
    () =>
      rows.map((r, i) => {
        const base = identifierError("Meter number", r.meter_number);
        if (base) return base;
        const key = r.meter_number.trim().toLowerCase();
        const dup = rows.some((o, j) => j !== i && o.meter_number.trim().toLowerCase() === key);
        if (dup) return "Duplicate meter number in this batch";
        if (r.serial_number.trim()) {
          const sErr = identifierError("Serial number", r.serial_number);
          if (sErr) return sErr;
          if (r.serial_number.trim().toLowerCase() === key)
            return "Serial number must differ from the meter number";
        }
        return null;
      }),
    [rows],
  );

  const ownerError = ownerId ? null : "Select who the meters belong to";
  const canSave = rows.length > 0 && !ownerError && rowErrors.every((e) => !e);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await bulkCreate({
        data: {
          supplier_id: supplierId || null,
          owner_type: ownerType,
          owner_id: ownerId,
          type: meterType,
          price_per_unit: pricePerUnit,
          initial_reading: initialReading,
          rows: rows.map((r) => ({
            meter_number: r.meter_number.trim(),
            serial_number: r.serial_number.trim(),
            sgc: r.sgc,
            krn: r.krn,
            ti: r.ti,
            ea: r.ea,
            ken: r.ken,
          })),
        },
      } as never);
      return (res as { created: number }).created;
    },
    onSuccess: (created) => onSaved(created),
    onError: (err: Error) => toast.error(err.message || "Could not add meters"),
  });

  const field = "h-11 w-full rounded-xl border border-border bg-background px-3 text-sm";
  const cell = "h-9 w-full rounded-lg border border-border bg-background px-2 text-sm";

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-add-meters-title"
    >
      <div className="my-8 w-full max-w-4xl rounded-2xl border border-border bg-card p-6 shadow-lg">
        <h2 id="bulk-add-meters-title" className="text-lg font-bold">
          Add Meters
        </h2>
        <p className="text-sm text-muted-foreground">
          Pick a supplier and owner, choose how many meters, then fill in each meter row.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="bulk-supplier">
              Supplier <span className="text-muted-foreground">(optional)</span>
            </label>
            <select
              id="bulk-supplier"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className={field}
            >
              <option value="">No supplier</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="bulk-owner-type">
              User type
            </label>
            <select
              id="bulk-owner-type"
              value={ownerType}
              onChange={(e) => setOwnerType(e.target.value as typeof ownerType)}
              className={field}
            >
              <option value="vendor">Vendor</option>
              <option value="landlord">Landlord</option>
              <option value="agent">Agent</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="bulk-owner">
              {ownerType === "vendor" ? "Vendor" : ownerType === "landlord" ? "Landlord" : "Agent"}
            </label>
            <select
              id="bulk-owner"
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              aria-invalid={Boolean(ownerError)}
              className={field}
            >
              <option value="">Select a user</option>
              {ownerOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            {ownerError && <p className="mt-1 text-xs text-destructive">{ownerError}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="bulk-type">
              Meter type
            </label>
            <select
              id="bulk-type"
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
            <label className="mb-1 block text-sm font-medium" htmlFor="bulk-price">
              Price per unit
            </label>
            <input
              id="bulk-price"
              type="number"
              step="0.01"
              min="0"
              value={pricePerUnit}
              onChange={(e) => setPricePerUnit(e.target.value)}
              className={field}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="bulk-initial">
              Initial reading
            </label>
            <input
              id="bulk-initial"
              type="number"
              step="0.01"
              min="0"
              value={initialReading}
              onChange={(e) => setInitialReading(e.target.value)}
              className={field}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-muted/30 p-4">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="bulk-count">
              Number of meters
            </label>
            <input
              id="bulk-count"
              type="number"
              min={1}
              max={500}
              value={count}
              onChange={(e) => setCount(e.target.value)}
              className="h-11 w-40 rounded-xl border border-border bg-background px-3 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={generateRows}
            className="h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Generate rows
          </button>
          {rows.length > 0 && (
            <span className="text-sm text-muted-foreground">{rows.length} rows ready</span>
          )}
        </div>

        {rows.length > 0 && (
          <div className="mt-4 max-h-[45vh] overflow-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 text-left">#</th>
                  <th className="px-2 py-2 text-left">Meter number</th>
                  <th className="px-2 py-2 text-left">Serial no (optional)</th>
                  <th className="px-2 py-2 text-left">SGC</th>
                  <th className="px-2 py-2 text-left">KRN</th>
                  <th className="px-2 py-2 text-left">TI</th>
                  <th className="px-2 py-2 text-left">EA</th>
                  <th className="px-2 py-2 text-left">KEN</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-border/70 align-top">
                    <td className="px-2 py-2 text-muted-foreground">{i + 1}</td>
                    <td className="px-2 py-2">
                      <input
                        value={r.meter_number}
                        onChange={(e) => setRow(i, "meter_number", e.target.value)}
                        aria-label={`Meter number row ${i + 1}`}
                        aria-invalid={Boolean(rowErrors[i])}
                        className={`${cell} ${rowErrors[i] ? "border-destructive" : ""}`}
                      />
                      {rowErrors[i] && (
                        <p className="mt-1 text-xs text-destructive">{rowErrors[i]}</p>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <input
                        value={r.serial_number}
                        onChange={(e) => setRow(i, "serial_number", e.target.value)}
                        aria-label={`Serial number row ${i + 1}`}
                        className={cell}
                      />
                    </td>
                    {(["sgc", "krn", "ti", "ea", "ken"] as const).map((k) => (
                      <td key={k} className="px-2 py-2">
                        <input
                          value={r[k]}
                          onChange={(e) => setRow(i, k, e.target.value)}
                          aria-label={`${k.toUpperCase()} row ${i + 1}`}
                          className={`${cell} w-20`}
                        />
                      </td>
                    ))}
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                        aria-label={`Remove row ${i + 1}`}
                        className="rounded-lg border border-border p-1.5 hover:bg-accent/10"
                      >
                        <X className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent/10"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave || mutation.isPending}
            onClick={() => mutation.mutate()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Create {rows.length || ""} Meter{rows.length === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </div>
  );
}
