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

import { addMeter, bulkMeterAction, listMeters } from "@/lib/meters.functions";
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
  return { page, limit, type, landlordId, q };
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
  | "price_per_unit"
  | "status";

function MetersPage() {
  const queryClient = useQueryClient();
  const fetchMeters = useServerFn(listMeters);

  const { page: currentPage, limit: pageSize, type, landlordId, q: search } = Route.useSearch();
  const navigate = useNavigate({ from: "/meters/" });
  const setPage = (page: number) => navigate({ search: (prev) => ({ ...prev, page }) });
  const setPageSize = (limit: number) =>
    navigate({ search: (prev) => ({ ...prev, page: 1, limit }) });
  const setType = (t: string) => navigate({ search: (prev) => ({ ...prev, page: 1, type: t }) });
  const setLandlordId = (landlordId: string) =>
    navigate({ search: (prev) => ({ ...prev, page: 1, landlordId }) });
  const setSearch = (q: string) => navigate({ search: (prev) => ({ ...prev, page: 1, q }) });

  const [sortKey, setSortKey] = useState<SortKey>("meter_number");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<null | "delete" | "deactivate" | "activate">(null);

  useEffect(() => {
    if (currentPage !== 1) setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, type, landlordId]);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["meters"],
    queryFn: () => fetchMeters(),
  });

  const meters = data?.meters ?? [];
  const landlords = data?.landlords ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return meters.filter((m) => {
      if (type !== "all" && m.type !== type) return false;
      if (landlordId !== "all" && (m.landlord_id ?? "none") !== landlordId) return false;
      if (!q) return true;
      return [m.meter_number, m.serial_number, m.vendor_id, m.landlord_name ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [meters, search, type, landlordId]);

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
            {(search || type !== "all" || landlordId !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setType("all");
                  setLandlordId("all");
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
                  <SortHeader label="Price / unit" sortBy="price_per_unit" />
                  <th className="px-3 py-2 font-semibold uppercase tracking-wide">STS</th>
                  <SortHeader label="Status" sortBy="status" />
                </tr>
              </thead>
              <tbody className="text-sm">
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                      <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
                      Loading meters…
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-destructive">
                      {(error as Error).message}
                    </td>
                  </tr>
                ) : paged.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
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

      {showAdd && (
        <AddMeterDialog
          landlords={landlords}
          onClose={() => setShowAdd(false)}
          onSaved={async () => {
            setShowAdd(false);
            await queryClient.invalidateQueries({ queryKey: ["meters"] });
            toast.success("Meter added");
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

function AddMeterDialog({
  landlords,
  onClose,
  onSaved,
}: {
  landlords: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const saveMeter = useServerFn(addMeter);

  const [vendorId, setVendorId] = useState("");
  const [landlordId, setLandlordId] = useState("");
  const [meterNumber, setMeterNumber] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [meterType, setMeterType] = useState<"electricity" | "water" | "gas">("electricity");
  const [initialReading, setInitialReading] = useState("0");
  const [pricePerUnit, setPricePerUnit] = useState("0");
  const [sts, setSts] = useState({ sgc: "", krn: "", ti: "", ea: "", ken: "" });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!vendorId.trim()) throw new Error("Please enter a vendor");
      if (!meterNumber.trim()) throw new Error("Please enter a meter number");
      if (!serialNumber.trim()) throw new Error("Please enter a serial number");
      await saveMeter({
        data: {
          vendor_id: vendorId.trim(),
          landlord_id: landlordId || null,
          meter_number: meterNumber.trim(),
          serial_number: serialNumber.trim(),
          type: meterType,
          initial_reading: initialReading,
          price_per_unit: pricePerUnit,
          sgc: sts.sgc,
          krn: sts.krn,
          ti: sts.ti,
          ea: sts.ea,
          ken: sts.ken,
        },
      } as never);
    },
    onSuccess: () => onSaved(),
    onError: (err: Error) => toast.error(err.message || "Could not add meter"),
  });

  const field = "h-11 w-full rounded-xl border bg-background px-3 text-sm";

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
          Add Meter
        </h2>
        <p className="text-sm text-muted-foreground">Register a meter in the meter registry.</p>

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
              className={field}
            />
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
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="meter-number">
              Meter Number
            </label>
            <input
              id="meter-number"
              value={meterNumber}
              onChange={(e) => setMeterNumber(e.target.value)}
              placeholder="e.g. 01234567890"
              className={field}
            />
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
              className={field}
            />
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
            disabled={
              mutation.isPending || !vendorId.trim() || !meterNumber.trim() || !serialNumber.trim()
            }
            onClick={() => mutation.mutate()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Save Meter
          </button>
        </div>
      </div>
    </div>
  );
}
