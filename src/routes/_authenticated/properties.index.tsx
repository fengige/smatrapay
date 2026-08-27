import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Home,
  Layers,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Users as UsersIcon,
  type LucideIcon,
} from "lucide-react";

import { listProperties } from "@/lib/properties.functions";
import { PortalLayout } from "@/components/PortalLayout";

const LIMIT_OPTIONS = [10, 25, 50, 100];
const DEFAULT_LIMIT = 10;

function parseSearch(search: Record<string, unknown>) {
  const page = Math.max(1, Number(search["page"]) || 1);
  const limit = LIMIT_OPTIONS.includes(Number(search["limit"]))
    ? Number(search["limit"])
    : DEFAULT_LIMIT;
  return { page, limit };
}

export const Route = createFileRoute("/_authenticated/properties/")({
  validateSearch: parseSearch,
  head: () => ({
    meta: [
      { title: "Property Management · SmatraPay" },
      {
        name: "description",
        content:
          "Manage SmatraPay properties: buildings, units, unit types, occupancy, residents and landlords.",
      },
      { property: "og:title", content: "Property Management · SmatraPay" },
      {
        property: "og:description",
        content: "Search, filter and manage every property in the SmatraPay portfolio.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PropertiesPage,
  errorComponent: ({ error }) => (
    <div className="p-10 text-sm text-destructive">{error.message}</div>
  ),
});

type Property = {
  id: string;
  name: string;
  code: string | null;
  city: string | null;
  country: string | null;
  status: string;
  property_type: string | null;
  created_at: string;
};

type Unit = {
  id: string;
  property_id: string;
  unit_number: string;
  building: string | null;
  unit_type: string | null;
  status: string;
};

type Assignment = {
  id: string;
  unit_id: string;
  user_id: string;
  role: string;
  start_date: string;
  end_date: string | null;
};

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <Icon className={`size-4 ${tone ?? "text-muted-foreground"}`} />
      </div>
      <p className="mt-2 text-2xl font-bold text-foreground">{value}</p>
    </div>
  );
}

const inputClass =
  "rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

function PropertiesPage() {
  const fetchProperties = useServerFn(listProperties);
  const { page: currentPage, limit: pageSize } = Route.useSearch();
  const navigate = useNavigate({ from: "/properties/" });

  const [search, setSearch] = useState("");
  const [unitType, setUnitType] = useState("all");
  const [status, setStatus] = useState("all");
  const [propertyType, setPropertyType] = useState("all");

  const setPage = (page: number) => navigate({ search: (prev) => ({ ...prev, page }) });
  const setPageSize = (limit: number) =>
    navigate({ search: (prev) => ({ ...prev, page: 1, limit }) });

  useEffect(() => {
    if (currentPage !== 1) setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, unitType, status, propertyType]);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["properties", "list"],
    queryFn: () => fetchProperties(),
  });

  const properties = useMemo(() => (data?.properties ?? []) as unknown as Property[], [data]);
  const units = useMemo(() => (data?.units ?? []) as unknown as Unit[], [data]);
  const assignments = useMemo(() => (data?.assignments ?? []) as unknown as Assignment[], [data]);

  const unitTypeOptions = useMemo(
    () => [...new Set(units.map((u) => (u.unit_type ?? "").trim()).filter(Boolean))].sort(),
    [units],
  );

  const rows = useMemo(() => {
    const unitsByProperty = new Map<string, Unit[]>();
    for (const unit of units) {
      const list = unitsByProperty.get(unit.property_id) ?? [];
      list.push(unit);
      unitsByProperty.set(unit.property_id, list);
    }
    const byUnit = new Map<string, Assignment[]>();
    for (const a of assignments) {
      const list = byUnit.get(a.unit_id) ?? [];
      list.push(a);
      byUnit.set(a.unit_id, list);
    }

    return properties.map((property) => {
      const propertyUnits = unitsByProperty.get(property.id) ?? [];
      const propertyAssignments = propertyUnits.flatMap((u) => byUnit.get(u.id) ?? []);
      const currentAssignments = propertyAssignments.filter((a) => !a.end_date);
      return {
        property,
        units: propertyUnits,
        buildings: [...new Set(propertyUnits.map((u) => (u.building ?? "").trim()).filter(Boolean))],
        unitTypes: [
          ...new Set(propertyUnits.map((u) => (u.unit_type ?? "").trim()).filter(Boolean)),
        ],
        residents: currentAssignments.filter((a) => a.role === "resident").length,
        landlords: currentAssignments.filter((a) => a.role === "landlord").length,
        earliestStart: propertyAssignments
          .map((a) => a.start_date)
          .sort()
          .at(0),
        startDates: propertyAssignments.map((a) => a.start_date),
      };
    });
  }, [properties, units, assignments]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (status !== "all" && row.property.status !== status) return false;
      if (propertyType !== "all" && (row.property.property_type ?? "building") !== propertyType)
        return false;
      if (unitType !== "all" && !row.unitTypes.includes(unitType)) return false;
      if (!term) return true;
      return [
        row.property.name,
        row.property.code,
        row.property.city,
        row.property.country,
        row.property.property_type,
        ...row.buildings,
        ...row.unitTypes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [rows, search, status, propertyType, unitType]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(currentPage, totalPages);
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const stats = useMemo(
    () => ({
      properties: properties.length,
      active: properties.filter((p) => p.status === "active").length,
      units: units.length,
      residents: assignments.filter((a) => !a.end_date && a.role === "resident").length,
    }),
    [properties, units, assignments],
  );

  const exportCsv = () => {
    const header = [
      "Property",
      "Type",
      "Code",
      "City",
      "Status",
      "Unit types",
      "Units",
      "Current residents",
      "Current landlords",
    ];
    const lines = filtered.map((row) => [
      row.property.name,
      row.property.property_type ?? "building",
      row.property.code ?? "",
      row.property.city ?? "",
      row.property.status,
      row.unitTypes.join(" | "),
      String(row.units.length),
      String(row.residents),
      String(row.landlords),
    ]);
    const csv = [header, ...lines]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `smatrapay-properties-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const resetFilters = () => {
    setSearch("");
    setUnitType("all");
    setStatus("all");
    setPropertyType("all");
  };

  return (
    <PortalLayout
      roles={["admin"]}
      title="Property Management"
      description="Properties, buildings and units across the portfolio"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/properties/new"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <Plus className="size-4" /> Add Property
          </Link>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!filtered.length}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium hover:bg-accent/10 disabled:opacity-60"
          >
            <Download className="size-4" /> Export CSV ({filtered.length})
          </button>
          <button
            type="button"
            onClick={() => refetch()}
            aria-label="Refresh properties"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium hover:bg-accent/10"
          >
            <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Properties" value={stats.properties} icon={Home} />
          <StatCard label="Active" value={stats.active} icon={Building2} tone="text-emerald-600" />
          <StatCard label="Units" value={stats.units} icon={Layers} />
          <StatCard label="Current Residents" value={stats.residents} icon={UsersIcon} />
        </div>

        <section className="rounded-2xl border border-border bg-card">
          <div className="space-y-3 border-b border-border p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex min-w-[220px] flex-1 items-stretch overflow-hidden rounded-lg border border-border focus-within:border-primary">
                <span className="flex items-center bg-muted/50 px-3 text-muted-foreground">
                  <Search className="size-4" />
                </span>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by property, code, city or unit type"
                  className="w-full bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/70"
                />
              </div>
              <select
                value={propertyType}
                onChange={(e) => setPropertyType(e.target.value)}
                aria-label="Filter by property type"
                className={inputClass}
              >
                <option value="all">All types</option>
                <option value="building">Building</option>
                <option value="zone">Zone</option>
              </select>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                aria-label="Filter by status"
                className={inputClass}
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
              <select
                value={unitType}
                onChange={(e) => setUnitType(e.target.value)}
                aria-label="Filter by unit type"
                className={inputClass}
              >
                <option value="all">All unit types</option>
                {unitTypeOptions.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <button
                type="button"
                onClick={resetFilters}
                className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-accent/10"
              >
                Reset filters
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Property</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Unit Type</th>
                  <th className="px-4 py-3 font-semibold">Units</th>
                  <th className="px-4 py-3 font-semibold">Residents</th>
                  <th className="px-4 py-3 font-semibold">Landlords</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
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
                {!isLoading && error && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-destructive">
                      {(error as Error).message}
                    </td>
                  </tr>
                )}
                {!isLoading && !error && !paged.length && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                      No properties match these filters.
                    </td>
                  </tr>
                )}
                {paged.map((row) => (
                  <tr key={row.property.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-foreground">{row.property.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {[row.property.code, row.property.city, row.property.country]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${
                          (row.property.property_type ?? "building") === "zone"
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {(row.property.property_type ?? "building") === "zone" ? (
                          <Layers className="size-3" />
                        ) : (
                          <Building2 className="size-3" />
                        )}
                        {row.property.property_type ?? "building"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {row.unitTypes.join(", ") || "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{row.units.length}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.residents}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.landlords}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${
                          row.property.status === "active"
                            ? "bg-emerald-500/12 text-emerald-600"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {row.property.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link
                          to="/properties/$id"
                          params={{ id: row.property.id }}
                          aria-label={`View ${row.property.name}`}
                          className="rounded-lg border border-border p-2 hover:bg-accent/10"
                        >
                          <Eye className="size-4" />
                        </Link>
                        <Link
                          to="/properties/$id/edit"
                          params={{ id: row.property.id }}
                          aria-label={`Edit ${row.property.name}`}
                          className="rounded-lg border border-border p-2 hover:bg-accent/10"
                        >
                          <Pencil className="size-4" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <span>Rows per page</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                aria-label="Rows per page"
                className={inputClass}
              >
                {LIMIT_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <span>
                {filtered.length ? (page - 1) * pageSize + 1 : 0}–
                {Math.min(page * pageSize, filtered.length)} of {filtered.length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page <= 1}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 font-medium disabled:opacity-50"
              >
                <ChevronLeft className="size-4" /> Previous
              </button>
              <span className="text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 font-medium disabled:opacity-50"
              >
                Next <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        </section>
      </div>
    </PortalLayout>
  );
}
