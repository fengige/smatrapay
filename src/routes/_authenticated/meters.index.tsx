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
  Loader2,
  Plus,
  RefreshCw,
  Search,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { addMeter, listMeters } from "@/lib/properties.functions";
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
  const propertyId = typeof search["property"] === "string" ? search["property"] : "all";
  const q = typeof search["q"] === "string" ? search["q"] : "";
  return { page, limit, type, propertyId, q };
}

export const Route = createFileRoute("/_authenticated/meters/")({
  validateSearch: parseSearch,
  head: () => ({
    meta: [
      { title: "Meter Management · SmatraPay" },
      {
        name: "description",
        content:
          "Monitor every electricity, water and gas meter across SmatraPay properties, with unit, property and landlord context.",
      },
      { property: "og:title", content: "Meter Management · SmatraPay" },
      {
        property: "og:description",
        content: "Search and filter the hardware asset registry of meters by serial, type and property.",
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

const statusTone: Record<string, string> = {
  vacant: "bg-muted text-muted-foreground",
  occupied: "bg-emerald-500/12 text-emerald-600",
  maintenance: "bg-amber-500/15 text-amber-600",
  archived: "bg-destructive/12 text-destructive",
};

type SortKey = "serial" | "type" | "unit_number" | "property_name" | "unit_status";

function MetersPage() {
  const queryClient = useQueryClient();
  const fetchMeters = useServerFn(listMeters);

  const { page: currentPage, limit: pageSize, type, propertyId, q: search } = Route.useSearch();
  const navigate = useNavigate({ from: "/meters/" });
  const setPage = (page: number) => navigate({ search: (prev) => ({ ...prev, page }) });
  const setPageSize = (limit: number) =>
    navigate({ search: (prev) => ({ ...prev, page: 1, limit }) });
  const setType = (t: string) => navigate({ search: (prev) => ({ ...prev, page: 1, type: t }) });
  const setPropertyId = (propertyId: string) =>
    navigate({ search: (prev) => ({ ...prev, page: 1, propertyId }) });
  const setSearch = (q: string) => navigate({ search: (prev) => ({ ...prev, page: 1, q }) });

  const [sortKey, setSortKey] = useState<SortKey>("serial");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    if (currentPage !== 1) setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, type, propertyId]);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["meters"],
    queryFn: () => fetchMeters(),
  });

  const meters = data?.meters ?? [];
  const properties = data?.properties ?? [];
  const units = data?.units ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return meters.filter((m) => {
      if (type !== "all" && m.type !== type) return false;
      if (propertyId !== "all" && m.property_id !== propertyId) return false;
      if (!q) return true;
      return [m.serial, m.unit_number, m.property_name, m.landlord_name ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [meters, search, type, propertyId]);

  const sortedRows = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        const av = String(a[sortKey] ?? "").toLowerCase();
        const bv = String(b[sortKey] ?? "").toLowerCase();
        if (av === bv) return 0;
        return sortDir === "asc" ? (av > bv ? 1 : -1) : av > bv ? -1 : 1;
      }),
    [filtered, sortKey, sortDir],
  );

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const page = Math.min(currentPage, totalPages);
  const paged = sortedRows.slice((page - 1) * pageSize, page * pageSize);

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
      ["Meter serial", "Type", "Unit", "Property", "Landlord", "Unit status"],
      ...sortedRows.map((m) => [
        m.serial,
        TYPE_META[m.type].label,
        m.unit_number,
        m.property_name,
        m.landlord_name ?? "—",
        m.unit_status,
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
                placeholder="Search serial / unit / property"
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
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              aria-label="Filter by property"
              className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary"
            >
              <option value="all">All properties</option>
              {properties.map((p: { id: string; name: string }) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {(search || type !== "all" || propertyId !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setType("all");
                  setPropertyId("all");
                }}
                className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <SortHeader label="Meter" sortBy="serial" />
                  <SortHeader label="Type" sortBy="type" />
                  <SortHeader label="Unit" sortBy="unit_number" />
                  <SortHeader label="Property" sortBy="property_name" />
                  <SortHeader label="Unit status" sortBy="unit_status" />
                  <th className="px-3 py-2 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                      <Loader2 className="mx-auto mb-2 size-5 animate-spin" />
                      Loading meters…
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-destructive">
                      {(error as Error).message}
                    </td>
                  </tr>
                ) : paged.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                      No meters match your filters. Add meter numbers on a unit to see them here.
                    </td>
                  </tr>
                ) : (
                  paged.map((m) => {
                    const meta = TYPE_META[m.type];
                    const Icon = meta.icon;
                    return (
                      <tr key={m.key} className="border-t border-border/70">
                        <td className="px-3 py-2.5">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span
                              className={`inline-flex size-8 shrink-0 items-center justify-center rounded-lg ${meta.tone}`}
                            >
                              <Icon className="size-4" />
                            </span>
                            <div className="min-w-0">
                              <div className="truncate font-medium text-foreground">{m.serial}</div>
                              <div className="truncate text-xs text-muted-foreground">
                                {m.landlord_name ?? "No landlord"}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${meta.tone}`}
                          >
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                          <Link
                            to="/units/$unitId"
                            params={{ unitId: m.unit_id }}
                            className="hover:text-foreground hover:underline"
                          >
                            Unit {m.unit_number}
                          </Link>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                          <Link
                            to="/properties/$id"
                            params={{ id: m.property_id }}
                            className="hover:text-foreground hover:underline"
                          >
                            {m.property_name}
                          </Link>
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                              statusTone[m.unit_status] ?? "bg-muted text-muted-foreground"
                            }`}
                          >
                            {m.unit_status}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            <Link
                              to="/units/$unitId"
                              params={{ unitId: m.unit_id }}
                              aria-label="View unit"
                              className="inline-flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent/10"
                            >
                              <Eye className="size-3.5" />
                            </Link>
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

      {showAdd && (
        <AddMeterDialog
          properties={properties}
          units={units}
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
  properties,
  units,
  onClose,
  onSaved,
}: {
  properties: { id: string; name: string }[];
  units: { id: string; property_id: string; unit_number: string }[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const saveMeter = useServerFn(addMeter);

  const [propertyId, setPropertyId] = useState<string>("");
  const [unitId, setUnitId] = useState<string>("");
  const [meterType, setMeterType] = useState<"electricity" | "water" | "gas">("electricity");
  const [serial, setSerial] = useState<string>("");

  useEffect(() => {
    setUnitId("");
  }, [propertyId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const unitChoices = useMemo(
    () => units.filter((u) => u.property_id === propertyId).sort((a, b) => a.unit_number.localeCompare(b.unit_number)),
    [units, propertyId],
  );

  const mutation = useMutation({
    mutationFn: async () => {
      if (!unitId) throw new Error("Please select a unit");
      if (!serial.trim()) throw new Error("Please enter a meter serial number");
      await saveMeter({ data: { unit_id: unitId, type: meterType, serial: serial.trim() } } as never);
    },
    onSuccess: () => {
      setSerial("");
      onSaved();
    },
    onError: (err: Error) => toast.error(err.message || "Could not add meter"),
  });

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-meter-title"
    >
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-lg">
        <h2 id="add-meter-title" className="text-lg font-bold">
          Add Meter
        </h2>
        <p className="text-sm text-muted-foreground">Assign a meter serial number to a unit.</p>

        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="meter-property">
              Property
            </label>
            <select
              id="meter-property"
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="h-11 w-full rounded-xl border bg-background px-3 text-sm"
            >
              <option value="">Select property</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="meter-unit">
              Unit
            </label>
            <select
              id="meter-unit"
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              disabled={!propertyId || unitChoices.length === 0}
              className="h-11 w-full rounded-xl border bg-background px-3 text-sm disabled:opacity-50"
            >
              <option value="">{unitChoices.length ? "Select unit" : "No units available"}</option>
              {unitChoices.map((u) => (
                <option key={u.id} value={u.id}>
                  Unit {u.unit_number}
                </option>
              ))}
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
              className="h-11 w-full rounded-xl border bg-background px-3 text-sm"
            >
              <option value="electricity">Electricity</option>
              <option value="water">Water</option>
              <option value="gas">Gas</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="meter-serial">
              Serial Number
            </label>
            <input
              id="meter-serial"
              type="text"
              value={serial}
              onChange={(e) => setSerial(e.target.value)}
              placeholder="e.g. EM-2026-001"
              className="h-11 w-full rounded-xl border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </div>

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
            disabled={mutation.isPending || !unitId || !serial.trim()}
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
